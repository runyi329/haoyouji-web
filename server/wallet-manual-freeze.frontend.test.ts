import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AI_WALLET_ASSETS, AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS } from '../shared/ai-wallet-assets';
import type { AiWalletAsset } from '../shared/ai-wallet-assets';
import type { ManualWalletFreeze } from '../client/src/lib/walletManualFreeze';
import { refreshAdminWalletSnapshot } from '../client/src/lib/adminWalletSnapshotRefresh';
// 严格离线：编译完整真实助手/组件，模块 require 只允许下面的无副作用白名单。
// 不 import 页面、tRPC 客户端、服务端路由或 DB；没有网络、浏览器、process 或真实资金调用。
// hooks 是显式 render 的最小 fixture；mutation 仅 spy，回调由测试手动结算，不模拟账务实现。
const helperSource = readFileSync(new URL('../client/src/lib/walletManualFreeze.ts', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../client/src/components/WalletManualFreezePanel.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../client/src/pages/AfRechargeManage.tsx', import.meta.url), 'utf8');
const panelAst = ts.createSourceFile('WalletManualFreezePanel.tsx', panelSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helperAst = ts.createSourceFile('walletManualFreeze.ts', helperSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const pageAst = ts.createSourceFile('AfRechargeManage.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}
function initializer(ast: ts.SourceFile, name: string): ts.Expression {
  return required(nodes(ast, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name)
    && node.name.text === name)?.initializer, name);
}
function compile(source: string, bindings: Record<string, unknown> = {}, fileName = 'offline-wallet.tsx'): any {
  const result = ts.transpileModule(source, { fileName, reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const errors = (result.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => '', getNewLine: () => '\n',
  }));
  return runInNewContext(result.outputText, {
    // Deliberately unavailable. Unknown require also fails closed.
    process: undefined, fetch: undefined, XMLHttpRequest: undefined, WebSocket: undefined,
    setTimeout: undefined, setInterval: undefined, window: undefined, ...bindings,
  }, { timeout: 1_000 });
}
function moduleExports(source: string, imports: Record<string, unknown>, bindings: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  const require = vi.fn((name: string) => {
    if (!Object.prototype.hasOwnProperty.call(imports, name)) throw new Error(`Forbidden offline import: ${name}`);
    return imports[name];
  });
  compile(source, { exports, require, ...bindings });
  return { exports, require };
}
function expression<T>(ast: ts.SourceFile, name: string, bindings: Record<string, unknown> = {}): T {
  return compile(`(${initializer(ast, name).getText(ast)});`, bindings) as T;
}
function attribute(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string, ast = pageAst) {
  const properties = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
  return properties.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(ast) === name);
}
function jsxCallback(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string, ast = pageAst) {
  const value = required(attribute(node, name, ast)?.initializer, name);
  if (!ts.isJsxExpression(value) || !value.expression) throw new Error(`Missing callback ${name}`);
  return value.expression;
}
type VNode = { type: unknown; props: Record<string, any>; children: unknown[] };
const React = { Fragment: 'Fragment', createElement: (type: unknown, props: Record<string, any> | null,
  ...children: unknown[]): VNode => ({ type, props: props ?? {}, children }) };
function treeNodes(tree: unknown): VNode[] {
  if (Array.isArray(tree)) return tree.flatMap(treeNodes);
  if (!tree || typeof tree !== 'object' || !('children' in tree)) return [];
  const node = tree as VNode;
  return [node, ...node.children.flatMap(treeNodes)];
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree && typeof tree === 'object' && 'children' in tree) return (tree as VNode).children.map(text).join('');
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
}
function helpers() {
  let sequence = 0;
  const runtime = moduleExports(helperSource, { '@shared/ai-wallet-assets': { AI_WALLET_ASSETS } }, {
    crypto: { randomUUID: () => `offline-${++sequence}` },
  });
  return runtime.exports as {
    normalizeManualFreezeAmount: (code: string, value: string) => string;
    compareManualFreezeAmounts: (left: string, right: string) => number;
    getManualFreezableAssets: (value: unknown) => { assetCode: AiWalletAsset; availableAmount: string }[];
    getManualFrozenAssetCount: (value: unknown) => number | null;
    validateManualRelease: (record: ManualWalletFreeze, value: string) => string;
    createManualFreezeRequestId: () => string;
    getManualFreezeRequest: (previous: { key: string; id: string } | null, payload: object) => { key: string; id: string };
  };
}
const record = (overrides: Partial<ManualWalletFreeze> = {}): ManualWalletFreeze => Object.freeze({
  id: 7001, assetCode: 'BTY', amount: '2.123456789123456789', releasedAmount: '1',
  remainingAmount: '1.123456789123456789', note: '逐笔冻结备注：合同保护', status: 'active',
  createdAt: '2026-11-18T08:00:00Z', ...overrides,
});
type Kind = 'freeze' | 'release';
type Payload = Record<string, any>;
type MutationOptions = { onSuccess: (result: unknown, variables: Payload) => void;
  onError: (error: Error, variables?: Payload) => void; onSettled: () => void };
type Submitted = { kind: Kind; payload: Payload; options: MutationOptions };
const stateNames = nodes(panelAst, ts.isVariableDeclaration).filter(node => ts.isArrayBindingPattern(node.name)
  && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(panelAst) === 'useState')
  .map(node => (node.name as ts.ArrayBindingPattern).elements[0].getText(panelAst));
function harness(options: { userId?: number; ledgerId?: number; code?: AiWalletAsset; items?: readonly ManualWalletFreeze[];
  availableAssets?: readonly { assetCode: string; availableAmount: string }[];
  events?: readonly { id: number; freezeId: number; direction: 'freeze' | 'release'; amount: string; note: string; createdAt: string }[] } = {}) {
  const state: unknown[] = [], setters: ReturnType<typeof vi.fn>[] = [], refs: any[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const effectDeps: unknown[][] = [];
  let effects: (() => void)[] = [];
  const submitted: Submitted[] = [];
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const onSaved = vi.fn();
  const invalidate = vi.fn((_input: unknown) => Promise.resolve());
  const query = { data: { items: options.items ?? Object.freeze([record()]), events: options.events ?? [], orderProtected: true,
    availableAssets: options.availableAssets ?? AI_WALLET_ASSETS.map(assetCode => ({ assetCode,
      availableAmount: assetCode === 'CNY' || assetCode === 'USDT' ? '999999999999999999.99999999' : '999999999999999999.999999999999999999' })) },
    isFetching: false, isError: false, isPending: false, refetch: vi.fn(() => Promise.resolve()) };
  const useQuery = vi.fn((input: Payload, _queryOptions: Payload) => {
    expect(Object.keys(input).sort()).toEqual(['ledgerId', 'userId']);
    expect(input).toEqual({ ledgerId: props.ledgerId, userId: props.userId });
    return query;
  });
  const currentOptions: Record<Kind, MutationOptions | undefined> = { freeze: undefined, release: undefined };
  const mutations = Object.fromEntries((['freeze', 'release'] as const).map(kind => [kind, {
    isPending: false,
    mutate: vi.fn((payload: Payload) => {
      const keys = kind === 'freeze' ? ['ledgerId', 'userId', 'assetCode', 'amount', 'note', 'requestId']
        : ['ledgerId', 'userId', 'freezeId', 'amount', 'note', 'requestId'];
      expect(Object.keys(payload).sort()).toEqual(keys.sort());
      expect(payload.ledgerId).toBe(52);
      expect(payload.userId).toBe(props.userId);
      expect(typeof payload.amount).toBe('string');
      expect(typeof payload.note).toBe('string');
      expect(payload.requestId).toMatch(/^MANUAL_offline-\d+$/);
      submitted.push({ kind, payload: { ...payload }, options: required(currentOptions[kind], `${kind} options`) });
    }),
  }])) as Record<Kind, { isPending: boolean; mutate: ReturnType<typeof vi.fn> }>;
  const useMutation = (kind: Kind) => vi.fn((value: MutationOptions) => { currentOptions[kind] = value; return mutations[kind]; });
  const mtrpc = { useUtils: vi.fn(() => ({ adminUser: { walletManualFreezeState: { invalidate } } })), adminUser: {
    walletManualFreezeState: { useQuery }, walletManualFreeze: { useMutation: useMutation('freeze') },
    walletManualRelease: { useMutation: useMutation('release') },
  } };
  const props = { ledgerId: options.ledgerId ?? 52, userId: options.userId ?? 28,
    defaultAssetCode: options.code ?? 'BTY', onSaved };
  const hooks = {
    useState: (initial: unknown) => {
      const index = stateIndex++;
      if (!(index in state)) {
        state[index] = typeof initial === 'function' ? initial() : initial;
        setters[index] = vi.fn((value: any) => { state[index] = typeof value === 'function' ? value(state[index]) : value; });
      }
      return [state[index], setters[index]];
    },
    useRef: (initial: unknown) => {
      const index = refIndex++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect: (callback: () => void, dependencies: unknown[]) => {
      const index = effectIndex++, previous = effectDeps[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
        effectDeps[index] = dependencies;
        effects.push(callback);
      }
    },
  };
  const runtime = moduleExports(panelSource, {
    react: hooks,
    'lucide-react': { ChevronDown: 'ChevronDown', LockKeyhole: 'LockKeyhole', RefreshCw: 'RefreshCw', UnlockKeyhole: 'UnlockKeyhole' },
    sonner: { toast }, '@shared/ai-wallet-assets': { AI_WALLET_ASSET_CATALOG },
    '@/pages/miban/mibanTrpc': { mtrpc }, '@/lib/walletManualFreeze': helpers(),
  }, { React });
  let tree: VNode;
  const render = () => {
    stateIndex = 0; refIndex = 0; effectIndex = 0; effects = [];
    tree = runtime.exports.WalletManualFreezePanel(props);
    effects.forEach(effect => effect());
    return tree;
  };
  const set = (name: string, value: unknown) => { setters[required(stateNames.indexOf(name) >= 0 ? stateNames.indexOf(name) : undefined, name)](value); };
  const get = (name: string) => state[stateNames.indexOf(name)];
  const byLabel = (label: string) => required(treeNodes(tree).find(node => node.props['aria-label'] === label), label);
  const byText = (label: string) => required(treeNodes(tree).find(node => node.type === 'button' && text(node) === label), label);
  const change = (label: string, value: string) => { byLabel(label).props.onChange({ target: { value } }); render(); };
  const freeze = () => required(treeNodes(tree).find(node => node.type === 'button' && node.props.onClick
    && text(node).startsWith('确认冻结')), 'freeze button').props.onClick();
  const start = (id = 7001) => {
    const row = required(treeNodes(tree).find(node => node.props['data-manual-freeze-id'] === id), `row ${id}`);
    required(treeNodes(row).find(node => node.type === 'button' && text(node) === '解冻'), 'release opener').props.onClick();
    render();
  };
  const release = () => byText('确认解冻').props.onClick();
  const fail = (index = submitted.length - 1) => {
    const call = submitted[index]; call.options.onError(new Error('离线结果未确认'), call.payload); call.options.onSettled(); render();
  };
  const succeed = (index = submitted.length - 1) => {
    const call = submitted[index]; call.options.onSuccess({ saved: true }, call.payload); call.options.onSettled(); render();
  };
  render(); set('open', true); render();
  return { render, set, get, byLabel, byText, change, freeze, start, release, fail, succeed,
    query, useQuery, props, onSaved, invalidate, toast, mutations, submitted, runtime,
    tree: () => tree, setter: (name: string) => setters[stateNames.indexOf(name)] };
}
const microtasks = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('真实逐次手动冻结操作审计展开', () => {
  it('同笔部分解冻分别显示备注和精确数量，不显示另一笔冻结的审计', () => {
    const h = harness({ events: [
      { id: 3, freezeId: 7001, direction: 'release', amount: '0.000000000000000001', note: '第二次解冻专用备注', createdAt: '2026-11-18T09:00:00Z' },
      { id: 2, freezeId: 7001, direction: 'release', amount: '1', note: '第一次解冻专用备注', createdAt: '2026-11-18T08:30:00Z' },
      { id: 1, freezeId: 9900, direction: 'freeze', amount: '5', note: '另一笔冻结不可混入', createdAt: '2026-11-18T08:00:00Z' },
    ] });
    const rendered = text(h.tree());
    expect(rendered).toContain('第二次解冻专用备注');
    expect(rendered).toContain('第一次解冻专用备注');
    expect(rendered).toContain('0.000000000000000001');
    expect(rendered).not.toContain('另一笔冻结不可混入');
    expect(h.submitted).toEqual([]);
  });
  it('每笔审计展开最多20条，空审计不显示虚构操作记录', () => {
    const h = harness({ events: Array.from({ length: 25 }, (_, index) => ({ id: index + 1, freezeId: 7001,
      direction: 'release' as const, amount: '1', note: `审计备注_${index}_`, createdAt: '2026-11-18T09:00:00Z' })) });
    const rendered = text(h.tree());
    expect(rendered).toContain('审计备注_19_');
    expect(rendered).not.toContain('审计备注_20_');
    expect(text(harness({ events: [] }).tree())).not.toContain('操作记录（最近20笔）');
  });
});

describe('严格离线编译真实助手和完整手动冻结组件', () => {
  it('运行依赖只允许纯目录/助手/hooks与spy；未知模块立即失败，无生产客户端加载', () => {
    const h = harness();
    expect(h.runtime.require.mock.calls.map(call => call[0])).toEqual([
      'react', 'lucide-react', 'sonner', '@shared/ai-wallet-assets', '@/pages/miban/mibanTrpc', '@/lib/walletManualFreeze',
    ]);
    expect(() => moduleExports('require("node:https");', {})).toThrow('Forbidden offline import');
    expect(compile('[typeof fetch, typeof process, typeof window, typeof XMLHttpRequest, typeof WebSocket];'))
      .toEqual(['undefined', 'undefined', 'undefined', 'undefined', 'undefined']);
    expect(h.submitted).toEqual([]);
  });

  it('有可冻结余额的完整fixture覆盖目录无重复，切币清空数量且不执行冻结，8/18位输入方式不变', () => {
    const h = harness();
    const coins = treeNodes(h.byLabel('手动冻结资产')).filter(node => node.type === 'option');
    expect(coins.map(node => node.props.value)).toEqual([...AI_WALLET_ASSETS]);
    expect(new Set(coins.map(node => node.props.value)).size).toBe(AI_WALLET_ASSETS.length);
    for (const code of ['BTY', 'CNY', 'USDT']) expect(coins.map(node => node.props.value)).toContain(code);
    expect(text(h.byLabel('手动冻结资产'))).toContain('比特元');
    h.change('手动冻结资产', 'CNY');
    expect(h.get('assetCode')).toBe('CNY'); expect(h.submitted).toEqual([]);
    for (const label of ['手动冻结数量', '手动解冻数量']) {
      if (label.includes('解冻')) h.start();
      expect(h.byLabel(label).props.type).toBe('text');
      expect(h.byLabel(label).props.inputMode).toBe('decimal');
    }
  });

  it.each([...AI_WALLET_ASSETS])('%s 真实助手及组件payload保留native8/multi18位数量，不走浮点或汇率', code => {
    const value = code === 'CNY' || code === 'USDT' ? '999999999999999999.12345678' : '999999999999999999.123456789123456789';
    expect(helpers().normalizeManualFreezeAmount(code, ` ${value} `)).toBe(value);
    const h = harness({ code }); h.change('手动冻结数量', ` ${value} `); h.freeze();
    expect(h.submitted[0].payload).toMatchObject({ assetCode: code, amount: value });
  });

  it.each(['', '0', '0.0', '-0', '-0.00000001', '-1', '+1', '1e-8', '1E18', 'Infinity', 'NaN',
    '.1', '1.', '01', '1,000', '1 2', '1000000000000000000', '0.1234567891234567891'])
  ('真实助手与组件拒绝负数/零/指数/非法格式/溢出：%s', input => {
    expect(() => helpers().normalizeManualFreezeAmount('BTY', input)).toThrow();
    const h = harness(); h.change('手动冻结数量', input); h.freeze();
    expect(h.mutations.freeze.mutate).not.toHaveBeenCalled(); expect(h.toast.error).toHaveBeenCalled();
  });

  it.each(['CNY', 'USDT'])('%s 原生资金最多8位；不把第9位静默舍入或转成零', code => {
    const normalize = helpers().normalizeManualFreezeAmount;
    expect(normalize(code, '0.00000001')).toBe('0.00000001');
    for (const value of ['0.000000001', '1.123456789']) expect(() => normalize(code, value)).toThrow('8位');
    expect(normalize(code, '12.34000000')).toBe('12.34');
    expect(normalize('BTY', '0.000000000000000001')).toBe('0.000000000000000001');
    expect(() => normalize('ORDER', '1')).toThrow('已启用');
  });

  it.each([
    ['9007199254740993.000000000000000001', '9007199254740993', 1],
    ['999999999999999999.123456789123456788', '999999999999999999.123456789123456789', -1],
    ['0.000000000000000001', '0', 1], ['1.2300', '1.23', 0], ['00001.01', '1.010', 0], ['9.99', '10', -1],
  ] as const)('真实比较%s与%s严格字符串精确比较=%s', (left, right, expected) => {
    expect(helpers().compareManualFreezeAmounts(left, right)).toBe(expected);
    expect(helpers().compareManualFreezeAmounts(right, left)).toBe(expected === 0 ? 0 : -expected);
  });

  it('比较器拒绝损坏/指数/负数量，两金额助手AST无Number/parseFloat/parseInt/汇率转换', () => {
    for (const value of ['-1', '1e0', 'NaN', '1000000000000000000', '1.1234567891234567890'])
      expect(() => helpers().compareManualFreezeAmounts(value, '1')).toThrow('记录数量无效');
    for (const name of ['normalizeManualFreezeAmount', 'compareManualFreezeAmounts']) {
      const fn = required(nodes(helperAst, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
      const calls = nodes(fn, ts.isCallExpression).map(node => node.expression.getText(helperAst));
      for (const forbidden of ['Number', 'parseFloat', 'parseInt', 'Math.round']) expect(calls).not.toContain(forbidden);
      expect(fn.getText(helperAst)).not.toMatch(/exchange|rate|price|toFixed/i);
    }
  });
});

describe('真实冻结/解冻处理器：schema、同步锁、请求幂等与独立逐笔备注', () => {
  it('冻结合同恰含ledgerId52/userId/assetCode/精确amount/note/requestId；busyRef拦同tick双点击', () => {
    const h = harness(); h.change('手动冻结数量', '1.123456789123456789');
    h.change('手动冻结备注', '  冻结逐笔备注\n第二行  ');
    h.freeze(); h.freeze();
    expect(h.mutations.freeze.isPending).toBe(false); // 不依赖异步React pending。
    expect(h.submitted).toHaveLength(1);
    expect(h.submitted[0].payload).toEqual({ ledgerId: 52, userId: 28, assetCode: 'BTY',
      amount: '1.123456789123456789', note: '冻结逐笔备注\n第二行', requestId: 'MANUAL_offline-1' });
    expect(h.mutations.release.mutate).not.toHaveBeenCalled();
  });

  it.each([{ ledgerId: 51 }, { userId: 0 }, { userId: -1 }, { userId: 1.5 }, { userId: Number.MAX_SAFE_INTEGER + 1 }])
  ('无效账本/用户禁止两种提交：%j', options => {
    const h = harness(options); h.change('手动冻结数量', '1'); h.freeze(); h.start(); h.release();
    expect(h.submitted).toEqual([]);
  });

  it.each(['freeze', 'release'] as const)('%s 失败保留草稿与相同payload requestId，重试不丢精度/备注', kind => {
    const h = harness();
    if (kind === 'freeze') { h.change('手动冻结数量', '1.123456789123456789'); h.change('手动冻结备注', '重试备注'); }
    else { h.start(); h.change('手动解冻备注', '重试备注'); }
    const submit = kind === 'freeze' ? h.freeze : h.release;
    submit(); const first = h.submitted[0].payload; h.fail(); submit();
    expect(h.submitted).toHaveLength(2); expect(h.submitted[1].payload).toEqual(first);
    expect(h.get(kind === 'freeze' ? 'note' : 'releaseNote')).toBe('重试备注');
    expect(h.toast.success).not.toHaveBeenCalled(); expect(h.onSaved).not.toHaveBeenCalled();
  });

  it.each(['amount', 'note', 'assetCode'] as const)('冻结失败后更改%s产生新requestId，不复用旧payload', field => {
    const h = harness(); h.change('手动冻结数量', '1'); h.change('手动冻结备注', '旧备注');
    h.freeze(); const first = h.submitted[0].payload.requestId; h.fail();
    const labels = { amount: '手动冻结数量', note: '手动冻结备注', assetCode: '手动冻结资产' };
    h.change(labels[field], { amount: '2', note: '新备注', assetCode: 'ETH' }[field]);
    if (field === 'assetCode') { expect(h.get('amount')).toBe(''); h.change('手动冻结数量', '1'); }
    h.freeze();
    expect(h.submitted[1].payload.requestId).not.toBe(first);
  });

  it.each(['amount', 'note', 'freezeId'] as const)('解冻失败后更改%s产生新requestId', field => {
    const h = harness({ items: [record(), record({ id: 7002 })] }); h.start(); h.release();
    const first = h.submitted[0].payload.requestId; h.fail();
    if (field === 'freezeId') h.start(7002);
    else h.change(field === 'amount' ? '手动解冻数量' : '手动解冻备注', field === 'amount' ? '0.5' : '另笔解冻备注');
    h.release(); expect(h.submitted[1].payload.requestId).not.toBe(first);
  });

  it('助手明确换用户/账本/来源/参数换id；相同payload保留同一个request对象', () => {
    const helper = helpers(), payload = { ledgerId: 52, userId: 28, assetCode: 'BTY', amount: '1', note: '逐笔' };
    const initial = helper.getManualFreezeRequest(null, payload);
    expect(helper.getManualFreezeRequest(initial, { ...payload })).toBe(initial);
    for (const changed of [{ userId: 29 }, { ledgerId: 53 }, { freezeId: 7001 }, { amount: '2' }, { note: '新备注' }, { assetCode: 'ETH' }])
      expect(helper.getManualFreezeRequest(initial, { ...payload, ...changed }).id).not.toBe(initial.id);
    expect(helper.createManualFreezeRequestId()).toMatch(/^MANUAL_offline-/);
  });

  it.each(['freeze', 'release'] as const)('%s 备注长度500可发送、501拒绝；备注草稿不混入另一操作', kind => {
    const h = harness(); h.change('手动冻结数量', '1'); h.change('手动冻结备注', '冻结草稿'); h.start();
    h.change('手动解冻备注', '解冻草稿');
    const label = kind === 'freeze' ? '手动冻结备注' : '手动解冻备注';
    const submit = kind === 'freeze' ? h.freeze : h.release;
    h.change(label, '字'.repeat(501)); submit(); expect(h.submitted).toEqual([]);
    expect(h.toast.error).toHaveBeenLastCalledWith('备注最多500字');
    h.change(label, '字'.repeat(500)); submit(); expect(h.submitted[0].payload.note).toBe('字'.repeat(500));
    expect(h.get(kind === 'freeze' ? 'releaseNote' : 'note')).toBe(kind === 'freeze' ? '解冻草稿' : '冻结草稿');
  });

  it('真实逐笔列表展示服务端备注及原始字符串数量；解冻备注通过独立持久化mutation合同发送', () => {
    const r = record({ note: '服务端已保存冻结备注\n按合同A' }), before = JSON.stringify(r);
    const h = harness({ items: Object.freeze([r]) });
    expect(text(h.tree())).toContain(r.note); expect(text(h.tree())).toContain(r.amount);
    expect(text(h.tree())).toContain(r.releasedAmount); expect(text(h.tree())).toContain(r.remainingAmount);
    h.start(); h.change('手动解冻备注', '  服务端保存解冻审计备注\n按合同A释放  '); h.release();
    expect(h.submitted[0].payload.note).toBe('服务端保存解冻审计备注\n按合同A释放');
    expect(JSON.stringify(r)).toBe(before); // fixture不伪造实际DB持久化或追加账务流水。
  });
});

describe('真实解冻只取当前用户手动list：拒绝订单/坏id/超额/已释放/错误或刷新中的状态', () => {
  it('useQuery绑定账本52与当前用户，禁止placeholder串用户；关闭仍后台读取计数，坏用户不启用查询', () => {
    const h = harness();
    expect(h.useQuery).toHaveBeenLastCalledWith({ ledgerId: 52, userId: 28 }, {
      enabled: true, placeholderData: undefined, staleTime: 0, retry: 1, refetchInterval: 15_000,
    });
    h.set('open', false); h.render(); expect(h.useQuery.mock.lastCall?.[1].enabled).toBe(true);
    for (const options of [{ ledgerId: 51 }, { userId: 0 }, { userId: 1.5 }])
      expect(harness(options).useQuery.mock.lastCall?.[1].enabled).toBe(false);
  });

  it('列表唯一来源stateQuery.data.items，不猜订单id或总冻结余额；UI明确订单/项目走原流程', () => {
    const h = harness({ items: [record(), record({ id: 7002, status: 'released', remainingAmount: '0' })] });
    const rows = treeNodes(h.tree()).filter(node => node.props['data-manual-freeze-id'] != null);
    expect(rows.map(node => node.props['data-manual-freeze-id'])).toEqual([7001, 7002]);
    expect(treeNodes(rows[1]).filter(node => node.type === 'button' && text(node) === '解冻')).toEqual([]);
    expect(initializer(panelAst, 'records').getText(panelAst)).toContain('stateQuery.data.items');
    expect(text(h.tree())).toContain('订单或项目冻结须在原订单或项目解除，不能在这里直接解冻');
    const empty = harness({ items: [] }); expect(text(empty.tree())).toContain('订单冻结不在本列表解冻');
    expect(panelSource).not.toMatch(/(?:orderId|projectId|frozenBalance|usdtFrozen|cnyFrozen)/);
  });

  it.each(['all', 'partial'] as const)('%s 解冻默认精确剩余，可改部分；合同含当前list真实freezeId与同步双击锁', mode => {
    const r = record(), h = harness({ items: [r] }); h.start();
    expect(h.get('releaseAmount')).toBe(r.remainingAmount); expect(h.byLabel('手动解冻数量').props.value).toBe(r.remainingAmount);
    expect(text(h.tree())).toContain('默认填入本笔剩余全部数量，可改为部分解冻');
    const amount = mode === 'all' ? r.remainingAmount : '0.000000000000000001';
    if (mode === 'partial') h.change('手动解冻数量', amount);
    h.change('手动解冻备注', '  释放逐笔  '); h.release(); h.release();
    expect(h.submitted).toHaveLength(1); expect(h.mutations.release.isPending).toBe(false);
    expect(h.submitted[0].payload).toEqual({ ledgerId: 52, userId: 28, freezeId: r.id,
      amount, note: '释放逐笔', requestId: 'MANUAL_offline-1' });
  });

  it('选中后list刷新使用当前真实剩余而非旧target；超额精确1e-18被拒绝', () => {
    const h = harness(); h.start();
    h.query.data.items = [record({ remainingAmount: '0.123456789123456788' })]; h.render();
    h.change('手动解冻数量', '0.123456789123456789'); h.release();
    expect(h.submitted).toEqual([]); expect(h.toast.error).toHaveBeenLastCalledWith('解冻数量超过本笔手动冻结的剩余数量');
    h.change('手动解冻数量', '0.123456789123456788'); h.release();
    expect(h.submitted[0].payload.amount).toBe('0.123456789123456788');
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7001', 'ORDER_7001', NaN, Infinity])
  ('坏id %s 即使注入当前list，也不能送往解冻mutation', id => {
    const bad = record({ id: id as number });
    const h = harness({ items: [bad] });
    expect(() => helpers().validateManualRelease(bad, '0.5')).toThrow('仍有效');
    // NaN !== NaN，真实JSX不显示该坏id表单；仍直接执行真实handler证明后置校验拒绝它。
    expression<() => void>(panelAst, 'submitRelease', {
      busyRef: { current: false }, pending: false, releaseTarget: bad, ledgerId: 52, userId: 28,
      records: h.query.data.items, stateQuery: h.query, releaseAmount: '0.5', releaseNote: '',
      validateManualRelease: helpers().validateManualRelease, getManualFreezeRequest: helpers().getManualFreezeRequest,
      releaseRequestRef: { current: null }, releaseMutation: h.mutations.release, toast: h.toast,
    })();
    expect(h.submitted).toEqual([]); expect(h.toast.error).toHaveBeenCalled();
  });

  it.each(['order', 'absent', 'new-user-list', 'released', 'zero', 'broken-remaining', 'stateError', 'refreshing'] as const)
  ('拒绝%s：真实handler找当前list、验证状态/精确剩余，错误不得提交', scenario => {
    const h = harness(); h.start();
    if (scenario === 'order') h.set('releaseTarget', record({ id: 91001 }));
    if (scenario === 'absent') h.query.data.items = [];
    if (scenario === 'new-user-list') h.query.data.items = [record({ id: 8001 })];
    if (scenario === 'released') h.query.data.items = [record({ status: 'released' })];
    if (scenario === 'zero') h.query.data.items = [record({ remainingAmount: '0' })];
    if (scenario === 'broken-remaining') h.query.data.items = [record({ remainingAmount: '1e0' })];
    if (scenario === 'stateError') h.query.isError = true;
    if (scenario === 'refreshing') h.query.isFetching = true;
    h.render();
    // order/absent表单已不渲染，仍执行真实AST handler，模拟旧DOM事件闭包/外部注入target。
    const handler = expression<() => void>(panelAst, 'submitRelease', {
      busyRef: { current: false }, pending: false, releaseTarget: h.get('releaseTarget'), ledgerId: 52, userId: 28,
      records: h.query.data.items, stateQuery: h.query, releaseAmount: h.get('releaseAmount'), releaseNote: '',
      validateManualRelease: helpers().validateManualRelease, getManualFreezeRequest: helpers().getManualFreezeRequest,
      releaseRequestRef: { current: null }, releaseMutation: h.mutations.release, toast: h.toast,
    });
    handler(); expect(h.submitted).toEqual([]); expect(h.toast.error).toHaveBeenCalled();
  });

  it.each(['isFetching', 'isError'] as const)('%s 不可打开解冻且已打开表单禁用提交，错误保留已有记录', field => {
    const h = harness(); h.query[field] = true; h.render(); h.start();
    expect(h.get('releaseTarget')).toBeNull(); expect(h.submitted).toEqual([]);
    const opener = h.byText('解冻'); expect(opener.props.disabled).toBe(true);
    h.query[field] = false; h.render(); h.start(); h.query[field] = true; h.render();
    expect(h.byText('确认解冻').props.disabled).toBe(true); h.release(); expect(h.submitted).toEqual([]);
    expect(treeNodes(h.tree()).filter(node => node.props['data-manual-freeze-id'] != null)).toHaveLength(1);
    if (field === 'isError') expect(text(h.tree())).toContain('手动冻结记录读取失败，暂不能解冻');
  });

  it('两种mutation pending互斥所有资金提交；同步busyRef也阻止跨操作同tick重复写入', () => {
    const h = harness(); h.change('手动冻结数量', '1'); h.start(); h.freeze(); h.release();
    expect(h.submitted).toHaveLength(1); expect(h.submitted[0].kind).toBe('freeze');
    h.fail(); h.mutations.release.isPending = true; h.render(); h.freeze();
    h.byText('解冻处理中…').props.onClick();
    expect(h.submitted).toHaveLength(1); expect(h.byText('解冻处理中…').props.disabled).toBe(true);
  });
});

describe('成功保存与只读刷新分离、用户key隔离、旧响应不能清新用户输入', () => {
  it.each(['freeze', 'release'] as const)('%s 成功后的invalidate拒绝/onSaved抛错只提示已保存，不触发mutation错误或重复提交', async kind => {
    const h = harness(); h.change('手动冻结数量', '1'); h.change('手动冻结备注', '冻结保存'); h.start();
    h.change('手动解冻备注', '释放保存');
    h.invalidate.mockImplementation(() => Promise.reject(new Error('离线刷新失败')));
    h.onSaved.mockImplementation(() => { throw new Error('离线余额刷新失败'); });
    const submit = kind === 'freeze' ? h.freeze : h.release;
    submit(); h.succeed(); await microtasks();
    expect(h.submitted).toHaveLength(1); expect(h.toast.success).toHaveBeenCalledOnce();
    expect(h.invalidate).toHaveBeenCalledWith({ ledgerId: 52, userId: 28 });
    expect(h.onSaved).toHaveBeenCalledWith(28, 'BTY');
    expect(h.toast.error.mock.calls.flat().join('|')).toContain('操作已保存');
    expect(h.toast.error.mock.calls.flat().join('|')).toContain('不要重复提交');
    expect(h.toast.error.mock.calls.flat().join('|')).not.toContain('结果尚未确认');
    if (kind === 'freeze') { expect(h.get('amount')).toBe(''); expect(h.get('note')).toBe(''); h.freeze(); }
    else { expect(h.get('releaseTarget')).toBeNull(); expect(h.get('releaseAmount')).toBe(''); expect(h.get('releaseNote')).toBe(''); }
    expect(h.submitted).toHaveLength(1);
  });

  it.each(['freeze', 'release'] as const)('%s 旧用户成功响应在identity变化时不清新用户任何草稿；只刷新提交用户', kind => {
    const h = harness(); h.change('手动冻结数量', '1'); h.start();
    (kind === 'freeze' ? h.freeze : h.release)();
    h.props.userId = 29; h.render();
    h.set('amount', '新用户金额'); h.set('note', '新用户冻结备注'); h.set('releaseTarget', record({ id: 8001 }));
    h.set('releaseAmount', '新用户释放金额'); h.set('releaseNote', '新用户释放备注'); h.set('page', 3); h.render();
    const names = ['amount', 'note', 'releaseTarget', 'releaseAmount', 'releaseNote', 'page'];
    const before = names.map(h.get); const counts = names.map(name => h.setter(name).mock.calls.length);
    h.succeed(0);
    expect(names.map(h.get)).toEqual(before); expect(names.map(name => h.setter(name).mock.calls.length)).toEqual(counts);
    expect(h.invalidate).toHaveBeenCalledWith({ ledgerId: 52, userId: 28 });
    expect(h.onSaved).toHaveBeenCalledWith(28, 'BTY');
  });

  it('真实父组件key按userId重挂，新实例无旧请求/金额/备注/释放目标/分页；旧实例完成不触碰新实例', () => {
    const panel = required(nodes(pageAst, ts.isJsxSelfClosingElement).find(node => node.tagName.getText(pageAst) === 'WalletManualFreezePanel'), 'parent freeze panel');
    const key = jsxCallback(panel, 'key');
    expect(compile(`(${key.getText(pageAst)});`, { adjAssetFlowUserId: 28 })).toBe('manual-freeze-28');
    expect(compile(`(${key.getText(pageAst)});`, { adjAssetFlowUserId: 29 })).toBe('manual-freeze-29');
    const old = harness(); old.change('手动冻结数量', '1'); old.freeze();
    const fresh = harness({ userId: 29, code: 'ETH', items: [record({ id: 8001, assetCode: 'ETH' })] });
    expect(['amount', 'note', 'releaseAmount', 'releaseNote'].map(fresh.get)).toEqual(['', '', '', '']);
    expect(fresh.get('releaseTarget')).toBeNull(); expect(fresh.get('page')).toBe(1); expect(fresh.get('assetCode')).toBe('ETH');
    fresh.change('手动冻结数量', '2'); fresh.change('手动冻结备注', '新用户草稿'); old.succeed();
    expect(fresh.get('amount')).toBe('2'); expect(fresh.get('note')).toBe('新用户草稿');
    expect(fresh.onSaved).not.toHaveBeenCalled(); expect(fresh.invalidate).not.toHaveBeenCalled();
  });

  it('父onSaved沿用既有用户隔离展示与余额刷新；旧用户成功不更改当前用户筛选或旧表单', () => {
    const panel = required(nodes(pageAst, ts.isJsxSelfClosingElement).find(node => node.tagName.getText(pageAst) === 'WalletManualFreezePanel'), 'panel');
    const setterNames = ['setAdjFlowTab', 'setAdjUserHistoryTab', 'setAdjUserFlowKeyword', 'setAdjUserFlowDatePreset',
      'setAdjUserFlowCustomStart', 'setAdjUserFlowCustomEnd', 'setAdjFundingFlowScope', 'setAdjAssetFlowScope'];
    const setters = Object.fromEntries(setterNames.map(name => [name, vi.fn()]));
    const selectedRef = { current: 29 };
    const showAdjSubmittedCurrency = expression<(id: number, code: string) => boolean>(pageAst, 'showAdjSubmittedCurrency', {
      ...setters, adjSelectedUserIdRef: selectedRef, AI_WALLET_SETTLEMENT_ASSETS,
      getWalletFlowCategory: (code: string) => code === 'CNY' ? 'cny' : code === 'USDT' ? 'stable' : 'digital',
    });
    const refreshAdjWalletAfterChange = vi.fn(() => Promise.resolve());
    const callback = compile(`(${jsxCallback(panel, 'onSaved').getText(pageAst)});`, { showAdjSubmittedCurrency, refreshAdjWalletAfterChange }) as (id: number, code: string) => void;
    callback(28, 'BTY'); for (const setter of Object.values(setters)) expect(setter).not.toHaveBeenCalled();
    expect(refreshAdjWalletAfterChange).toHaveBeenCalledWith(28);
    callback(29, 'ETH'); expect(setters.setAdjFlowTab).toHaveBeenCalledWith('user');
    expect(setters.setAdjUserHistoryTab).toHaveBeenCalledWith('digital'); expect(refreshAdjWalletAfterChange).toHaveBeenCalledWith(29);
    expect(jsxCallback(panel, 'onSaved').getText(pageAst)).not.toMatch(/setAdjAmount|setAdjNote|\.mutate\(/);
  });

  it('父余额刷新真实Promise.allSettled只读失效提交用户快照/流水，失败已保存提示且无资金mutation', async () => {
    const names = ['walletSnapshot', 'multiAssetWalletHistoryPage', 'list', 'walletGlobalHistory', 'walletBalanceTrend', 'multiAssetWalletHistory'];
    const adminUser = Object.fromEntries(names.map(name => [name, { invalidate: vi.fn(() => Promise.reject(new Error(`离线${name}失败`))) }]));
    const snapshot = { cancel: vi.fn(async () => undefined), invalidate: adminUser.walletSnapshot.invalidate,
      fetch: vi.fn(async () => ({ id: 28 })) };
    adminUser.walletSnapshot = snapshot;
    const history = { invalidate: vi.fn(() => Promise.reject(new Error('离线资金流水失败'))) };
    const toast = { error: vi.fn() };
    const refresh = expression<(id: number) => Promise<void>>(pageAst, 'refreshAdjWalletAfterChange', {
      adjUtils: { adminUser, ledger: { afGetMyRechargeHistory: history } }, toast, refreshAdminWalletSnapshot,
    });
    await expect(refresh(28)).resolves.toBeUndefined(); await microtasks();
    expect(snapshot.cancel).toHaveBeenCalledWith({ userId: 28 });
    expect(snapshot.invalidate).toHaveBeenCalledWith({ userId: 28 }, { refetchType: 'none' });
    expect(snapshot.fetch).not.toHaveBeenCalled(); // helper 必须串行，invalidate 失败不继续读。
    expect(history.invalidate).toHaveBeenCalledWith({ viewAsUserId: 28 }, undefined, { cancelRefetch: true, throwOnError: true });
    expect(adminUser.multiAssetWalletHistoryPage.invalidate).toHaveBeenCalledWith({ userId: 28 }, undefined, { cancelRefetch: true, throwOnError: true });
    expect(toast.error).toHaveBeenCalledWith('账目已保存，部分余额或流水更新失败，请点更新重试；不要重复添加');
    expect(initializer(pageAst, 'refreshAdjWalletAfterChange').getText(pageAst)).not.toContain('.mutate(');
  });
});

describe('真实手动记录每页20条、UI分页回调与原资产前置布局/加减处理器不串线', () => {
  it('45条跨3页完整无重漏，原始精确数量/备注未修改；真实上一页下一页清释放目标', () => {
    const rows = Object.freeze(Array.from({ length: 45 }, (_, index) => record({ id: 7001 + index, note: `持久备注${index}` })));
    const before = JSON.stringify(rows), h = harness({ items: rows }); const seen: number[] = [];
    for (let page = 1; page <= 3; page++) {
      expect(text(h.tree())).toContain(`${page} / 3 页 · 每页20条`);
      const ids = treeNodes(h.tree()).filter(node => node.props['data-manual-freeze-id'] != null).map(node => node.props['data-manual-freeze-id']);
      expect(ids).toEqual(rows.slice((page - 1) * 20, page * 20).map(row => row.id));
      expect(ids).toHaveLength(page === 3 ? 5 : 20); seen.push(...ids);
      expect(h.byText('上一页').props.disabled).toBe(page === 1); expect(h.byText('下一页').props.disabled).toBe(page === 3);
      if (page < 3) { h.start(ids[0]); h.byText('下一页').props.onClick(); h.render(); expect(h.get('releaseTarget')).toBeNull(); }
    }
    expect(seen).toEqual(rows.map(row => row.id)); expect(new Set(seen).size).toBe(45);
    h.byText('上一页').props.onClick(); h.render(); expect(h.get('page')).toBe(2);
    expect(JSON.stringify(rows)).toBe(before); expect(h.submitted).toEqual([]);
  });

  it('页码删末页后立即钳制，空list稳定不显示分页；pending禁用分页；更新按钮仅refetch', () => {
    const rows = Array.from({ length: 41 }, (_, index) => record({ id: 7001 + index }));
    const h = harness({ items: rows }); h.set('page', 3); h.render();
    h.query.data.items = rows.slice(0, 40); h.render(); expect(text(h.tree())).toContain('2 / 2 页');
    expect(treeNodes(h.tree()).filter(node => node.props['data-manual-freeze-id'] != null)).toHaveLength(20);
    h.mutations.freeze.isPending = true; h.render();
    expect(h.byText('上一页').props.disabled).toBe(true); expect(h.byText('下一页').props.disabled).toBe(true);
    h.mutations.freeze.isPending = false; h.render(); h.byText('更新').props.onClick();
    expect(h.query.refetch).toHaveBeenCalledOnce(); expect(h.submitted).toEqual([]);
    h.query.data.items = []; h.render(); expect(text(h.tree())).not.toContain('每页20条');
  });

  it('资产卡仍在原币种/金额/备注/确认表单之前，独立手动freeze在旧表单之后及流水tab之前', () => {
    const panel = required(nodes(pageAst, ts.isJsxSelfClosingElement).find(node => node.tagName.getText(pageAst) === 'WalletManualFreezePanel'), 'panel');
    expect(nodes(pageAst, ts.isJsxSelfClosingElement).filter(node => node.tagName.getText(pageAst) === 'WalletManualFreezePanel')).toHaveLength(1);
    const summary = required(nodes(pageAst, ts.isJsxElement).find(node => attribute(node, 'ref')?.initializer?.getText(pageAst) === '{adjSelectedUserExportRef}'), 'assets');
    const currency = required(nodes(pageAst, ts.isJsxElement).find(node => node.openingElement.tagName.getText(pageAst) === 'select'
      && attribute(node, 'value')?.initializer?.getText(pageAst) === '{adjCurrency}'), 'original currency');
    const amount = required(nodes(pageAst, ts.isJsxSelfClosingElement).find(node => attribute(node, 'value')?.initializer?.getText(pageAst) === '{adjAmount}'), 'original amount');
    const note = required(nodes(pageAst, ts.isJsxSelfClosingElement).find(node => attribute(node, 'value')?.initializer?.getText(pageAst) === '{adjNote}'), 'original note');
    const submit = required(nodes(pageAst, ts.isJsxElement).find(node => attribute(node, 'onClick')?.initializer?.getText(pageAst) === '{handleAdjSubmit}'), 'original submit');
    for (const control of [currency, amount, note, submit]) expect(summary.end).toBeLessThan(control.pos);
    expect(submit.end).toBeLessThan(panel.pos);
    const flowTab = required(nodes(pageAst, ts.isJsxText).find(node => node.text.trim() === '当前用户流水' && node.pos > panel.end), 'current user tab');
    expect(panel.end).toBeLessThan(flowTab.pos);
    expect(attribute(panel, 'ledgerId')?.initializer?.getText(pageAst)).toBe('{52}');
    expect(attribute(panel, 'userId')?.initializer?.getText(pageAst)).toBe('{adjAssetFlowUserId}');
    const gate = required(nodes(pageAst, ts.isJsxExpression).find(node => node.pos < panel.pos && node.end > panel.end
      && node.expression && ts.isBinaryExpression(node.expression)), 'panel ledger/user gate');
    expect(gate.expression?.getText(pageAst)).toContain('Number(ledgerId) === 52 && adjAssetFlowUserId > 0');
    expect(attribute(submit, 'disabled')?.initializer?.getText(pageAst)).toBe('{adjMutation.isPending || multiAssetAdjMutation.isPending || !adjSelectedUser}');
  });

  it.each(['CNY', 'USDT', 'ETH', 'BTY'])('旧%s增加/扣款真实handler继续独立walletAdjust/multiAssetWalletAdjust，未转成冻结', code => {
    for (const direction of ['add', 'sub']) {
      const adjMutation = { mutate: vi.fn() }, multiAssetAdjMutation = { mutate: vi.fn() }, toast = { error: vi.fn(), info: vi.fn() };
      const handler = expression<() => void>(pageAst, 'handleAdjSubmit', {
        adjSelectedUser: { id: 28 }, adjAmount: '1.12345678', adjCurrency: code, adjDirection: direction, adjNote: '  原处理器备注  ',
        AI_WALLET_SETTLEMENT_ASSETS, adjMutation, multiAssetAdjMutation, toast,
        crypto: { randomUUID: () => 'offline-original-id' }, window: { location: { hostname: 'offline.invalid' } },
      });
      handler();
      if (code === 'CNY' || code === 'USDT') {
        expect(adjMutation.mutate).toHaveBeenCalledWith({ userId: 28, currency: code,
          amount: direction === 'sub' ? -1.12345678 : 1.12345678, note: '原处理器备注' });
        expect(multiAssetAdjMutation.mutate).not.toHaveBeenCalled();
      } else {
        expect(multiAssetAdjMutation.mutate).toHaveBeenCalledWith({ userId: 28, assetCode: code,
          amount: direction === 'sub' ? '-1.12345678' : '1.12345678', note: '原处理器备注', requestId: 'offlineoriginalid' });
        expect(adjMutation.mutate).not.toHaveBeenCalled();
      }
      expect(initializer(pageAst, 'handleAdjSubmit').getText(pageAst)).not.toMatch(/walletManual|submitFreeze|submitRelease/);
    }
  });

  it('旧资金handler仍保留预览环境禁止真实提交护栏；独立面板不加载任何旧mutation', () => {
    const adjMutation = { mutate: vi.fn() }, multiAssetAdjMutation = { mutate: vi.fn() }, toast = { error: vi.fn(), info: vi.fn() };
    expression<() => void>(pageAst, 'handleAdjSubmit', {
      adjSelectedUser: { id: 28 }, adjAmount: '1', adjCurrency: 'USDT', adjDirection: 'add', adjNote: '',
      adjMutation, multiAssetAdjMutation, toast, window: { location: { hostname: 'offline.manus.computer' } },
    })();
    expect(adjMutation.mutate).not.toHaveBeenCalled(); expect(multiAssetAdjMutation.mutate).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledOnce();
    const mutationCalls = nodes(panelAst, ts.isCallExpression).filter(node => ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'useMutation').map(node => node.expression.getText(panelAst));
    expect(mutationCalls).toEqual(['mtrpc.adminUser.walletManualFreeze.useMutation', 'mtrpc.adminUser.walletManualRelease.useMutation']);
  });
});

describe('可冻结币种过滤与精确最大数量：执行真实助手和完整面板', () => {
  const balances = Object.freeze([
    { assetCode: 'BTY', availableAmount: '396387.820000000000000001' },
    { assetCode: 'CNY', availableAmount: '0.00000000' },
    { assetCode: 'USDT', availableAmount: '-1' },
    { assetCode: 'BTC', availableAmount: '0.000000000000000001' },
    { assetCode: 'ETH', availableAmount: '0' },
    { assetCode: 'UNKNOWN', availableAmount: '999' },
  ]);
  it('只显示有正原币可用数量的已启用资产，零、负、无持有和未知币不出现在下拉里', () => {
    const h = harness({ availableAssets: balances });
    const coins = treeNodes(h.byLabel('手动冻结资产')).filter(node => node.type === 'option');
    expect(coins.map(node => node.props.value)).toEqual(['BTY', 'BTC']);
    expect(text(h.byLabel('手动冻结资产'))).toContain('比特元');
    expect(h.byLabel('手动冻结数量').props.placeholder).toBe('可冻结 396387.820000000000000001');
    expect(h.submitted).toEqual([]);
  });
  it.each([
    ['BTY', '396387.820000000000000001'], ['BTC', '0.000000000000000001'],
    ['CNY', '181110.37000001'], ['USDT', '9007199254740993.12345678'],
  ] as const)('%s 最大直接填入服务端精确原币数量%s，不自动提交', (assetCode, availableAmount) => {
    const h = harness({ code: assetCode, availableAssets: [{ assetCode, availableAmount }] });
    h.byLabel('填入最大可冻结数量').props.onClick(); h.render();
    expect(h.byLabel('手动冻结数量').props.value).toBe(availableAmount);
    expect(h.submitted).toEqual([]);
    h.freeze(); expect(h.submitted[0].payload).toMatchObject({ assetCode, amount: availableAmount });
  });
  it('切币清空旧金额，输入框立即改成该币可冻结数量，最大按钮只填新币余额', () => {
    const h = harness({ availableAssets: balances });
    h.byLabel('填入最大可冻结数量').props.onClick(); h.render();
    h.change('手动冻结资产', 'BTC');
    expect(h.get('amount')).toBe('');
    expect(h.byLabel('手动冻结数量').props.placeholder).toBe('可冻结 0.000000000000000001');
    h.byLabel('填入最大可冻结数量').props.onClick(); h.render();
    expect(h.get('amount')).toBe('0.000000000000000001');
    expect(h.submitted).toEqual([]);
  });
  it('默认币没有余额时自动选有余额币，绝不显示不存在余额的默认币', () => {
    const h = harness({ code: 'USDT', availableAssets: [{ assetCode: 'BTY', availableAmount: '5.123456789123456789' }] });
    h.render();
    expect(h.get('assetCode')).toBe('BTY');
    expect(h.byLabel('手动冻结资产').props.value).toBe('BTY');
    expect(h.byLabel('手动冻结数量').props.placeholder).toBe('可冻结 5.123456789123456789');
    expect(h.submitted).toEqual([]);
  });
  it('无可冻结资产时显示空状态，不能点最大或提交，但既有手动冻结仍可逐笔解冻', () => {
    const h = harness({ availableAssets: [] });
    expect(text(h.byLabel('手动冻结资产'))).toContain('暂无可冻结资产');
    expect(h.byLabel('填入最大可冻结数量').props.disabled).toBe(true);
    expect(h.byLabel('手动冻结数量').props.disabled).toBe(true);
    h.set('amount', '1'); h.render(); h.freeze();
    expect(h.submitted).toEqual([]);
    h.start(); h.release(); expect(h.submitted[0].kind).toBe('release');
  });
  it.each(['isError', 'isPending'] as const)('只读余额%s时禁用最大和冻结，不把旧可用数量当成当前可冻结量', field => {
    const h = harness({ availableAssets: balances });
    h.query[field] = true; h.render();
    expect(h.byLabel('填入最大可冻结数量').props.disabled).toBe(true);
    h.byLabel('填入最大可冻结数量').props.onClick(); h.render(); expect(h.get('amount')).toBe('');
    h.set('amount', '1'); h.render(); h.freeze(); expect(h.submitted).toEqual([]);
  });
  it('后台轮询不隐藏已有下拉、不清草稿，余额变动更新提示和最大，提交仍精确拦超额', () => {
    const h = harness({ availableAssets: [{ assetCode: 'BTY', availableAmount: '2.123456789123456789' }] });
    h.change('手动冻结数量', '2.123456789123456789');
    h.query.isFetching = true; h.render();
    expect(h.byLabel('手动冻结资产').props.disabled).toBe(false);
    expect(h.get('amount')).toBe('2.123456789123456789');
    h.query.data.availableAssets = [{ assetCode: 'BTY', availableAmount: '2.123456789123456788' }]; h.render();
    expect(h.byLabel('手动冻结数量').props.placeholder).toBe('可冻结 2.123456789123456788');
    h.freeze(); expect(h.submitted).toEqual([]);
    expect(h.toast.error).toHaveBeenLastCalledWith('本资产最多可冻结 2.123456789123456788 BTY');
    h.byLabel('填入最大可冻结数量').props.onClick(); h.render();
    expect(h.get('amount')).toBe('2.123456789123456788');
  });
  it('读接口缺少余额字段时必须禁用，不能退回全币目录或钱包总冻结量', () => {
    const h = harness(); delete (h.query.data as any).availableAssets; h.render();
    expect(h.byLabel('填入最大可冻结数量').props.disabled).toBe(true);
    expect(text(h.byLabel('手动冻结资产'))).toContain('可冻结余额待更新');
    h.set('amount', '1'); h.render(); h.freeze(); expect(h.submitted).toEqual([]);
  });
  it('可冻结助手不接受浮点余额、科学计数法、超8/18位或伪造币种，不依赖行情', () => {
    const helper = helpers();
    expect(helper.getManualFreezableAssets([{ assetCode: 'BTY', availableAmount: 1 },
      { assetCode: 'BTC', availableAmount: '1e-18' }, { assetCode: 'CNY', availableAmount: '0.000000001' },
      { assetCode: 'BTY', availableAmount: '1.1234567891234567890' },
      { assetCode: 'BTY', availableAmount: '0.000000000000000001' },
      { assetCode: 'BTY', availableAmount: '3' }])).toEqual([{ assetCode: 'BTY', availableAmount: '0.000000000000000001' }]);
    const maximum = initializer(panelAst, 'fillMaximum').getText(panelAst);
    expect(maximum).toContain('setAmount(selectedFreezableAsset.availableAmount)');
    expect(maximum).not.toMatch(/Number|parseFloat|toFixed|mutate|rate|price/);
  });
});

describe('折叠标题：仅显示简短已冻币种数', () => {
  it('多笔同币只算一种，已全部释放与零剩余不计入，折叠也能看到数字', () => {
    const h = harness({ items: [record(), record({ id: 7002 }),
      record({ id: 7003, assetCode: 'CNY', remainingAmount: '1' }),
      record({ id: 7004, assetCode: 'ETH', status: 'released', remainingAmount: '0' }),
      record({ id: 7005, assetCode: 'USDT', remainingAmount: '0' })] });
    h.set('open', false); h.render();
    expect(text(h.byLabel('已手动冻结币种数'))).toBe('已冻 2');
    expect(text(h.tree())).not.toContain('可冻');
    expect(text(h.tree())).not.toContain('本用户手动冻结记录');
    expect(treeNodes(h.tree()).filter(node => node.props['data-manual-freeze-id'] != null)).toEqual([]);
    expect(h.useQuery.mock.lastCall?.[1].enabled).toBe(true);
    expect(h.submitted).toEqual([]);
  });
  it('超过20笔也按完整记录去重，不受分页影响，微小18位剩余仍算已冻', () => {
    const h = harness({ items: [...Array.from({ length: 25 }, (_, index) => record({ id: 7001 + index })),
      record({ id: 8001, assetCode: 'BTC', remainingAmount: '0.000000000000000001' })] });
    h.set('open', false); h.set('page', 2); h.render();
    expect(text(h.byLabel('已手动冻结币种数'))).toBe('已冻 2');
  });
  it('折叠后台更新不闪加载文字；解冻完最后一笔该币种后数字自然减少', () => {
    const h = harness({ items: [record(), record({ id: 7002, assetCode: 'CNY' })] });
    h.set('open', false); h.render(); const idle = text(h.tree());
    h.query.isFetching = true; h.render(); expect(text(h.tree())).toBe(idle);
    h.query.data.items = [record({ status: 'released', remainingAmount: '0' }), record({ id: 7002, assetCode: 'CNY' })];
    h.render(); expect(text(h.byLabel('已手动冻结币种数'))).toBe('已冻 1');
    h.query.data.items = []; h.render(); expect(text(h.byLabel('已手动冻结币种数'))).toBe('已冻 0');
    expect(h.submitted).toEqual([]);
  });
  it('尚未返回记录或坏数据不显示假零；读取失败但已有缓存仍保留已知数量', () => {
    const h = harness(); h.set('open', false); h.query.isError = true; h.render();
    expect(text(h.byLabel('已手动冻结币种数'))).toBe('已冻 1');
    delete (h.query.data as any).items; h.render(); expect(text(h.byLabel('已手动冻结币种数'))).toBe('已冻 —');
    h.query.data.items = [record({ remainingAmount: '1e-18' })]; h.render();
    expect(text(h.byLabel('已手动冻结币种数'))).toBe('已冻 —');
  });
  it('只统计手动列表，不拿可冻结余额或订单总冻结数量猜测', () => {
    const h = harness({ items: [], availableAssets: [{ assetCode: 'BTY', availableAmount: '99' }] });
    h.set('open', false); h.render(); expect(text(h.byLabel('已手动冻结币种数'))).toBe('已冻 0');
    expect(initializer(panelAst, 'frozenAssetCount').getText(panelAst)).toBe('getManualFrozenAssetCount(stateQuery.data?.items)');
    expect(helpers().getManualFrozenAssetCount(undefined)).toBeNull();
    expect(helpers().getManualFrozenAssetCount([record(), record({ id: 7002 })])).toBe(1);
  });
});
