import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Switch as ActualSwitch } from '../client/src/components/ui/switch';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';

// Evaluate production AST/React elements only: no page import, router, DB, HTTP or service startup.
const source = readFileSync(new URL('../client/src/pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LedgerAAInitialBalance.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const ordinarySource = readFileSync(new URL('../client/src/components/OrdinaryTagInlineMemberRow.tsx', import.meta.url), 'utf8');
const ordinaryAst = ts.createSourceFile('OrdinaryTagInlineMemberRow.tsx', ordinarySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.Expression>();
const calls: ts.CallExpression[] = [];
const jsx: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(ast), node.initializer);
  if (ts.isCallExpression(node)) calls.push(node);
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) jsx.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
function execute(value: string, scope: Record<string, any>) {
  const js = ts.transpileModule(`const execute = ${value};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return execute;`)(React, ...Object.values(scope));
}
function expression(name: string, scope: Record<string, any>) {
  const value = declarations.get(name);
  if (!value) throw new Error(`Missing actual frontend expression: ${name}`);
  return execute(value.getText(ast), scope);
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function ancestors(node: ts.Node): ts.Node[] {
  const list: ts.Node[] = [];
  for (let current: ts.Node | undefined = node; current; current = current.parent) list.push(current);
  return list;
}
function attribute(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === name) as ts.JsxAttribute | undefined;
}
function harness() {
  const scope: Record<string, any> = {
    ledgerId: 37, LEDGER37_AI_DISPLAY_KEY, user: { id: 1, role: 'parent' }, ledgerData: { userRole: 'owner' },
    canAccess: true, canManageLedger37Ai: true, canPreviewLedger37Ai: false, isLocalHotPreview: false,
    window: { location: { search: '' }, sessionStorage: { getItem: () => null } },
    allBalancesData: { members: [{ userId: 901, name: '成员甲' }, { userId: 902, username: '成员乙' }], balancesMap: { 901: {}, 902: {} } },
    ledger37AiDisplayOverrides: {}, ledger37AiPreviewDrafts: {}, ledger37AiViewScopeRef: { current: '37:1:self' }, ledger37AiSavingScopes: new Set(),
    toast: { info: vi.fn() },
    saveLedger37AiDisplay: vi.fn(), Switch: 'Switch', Bot: 'Bot', UserAvatar: 'UserAvatar', Save: 'Save', ChevronDown: 'ChevronDown',
    selectedUserId: 902, expandedUsers: new Set([901]), setSelectedUserId: vi.fn(), setUserDropOpen: vi.fn(),
  };
  scope.setExpandedUsers = vi.fn(update => { scope.expandedUsers = update(scope.expandedUsers); });
  scope.setLedger37AiPreviewDrafts = vi.fn(update => { scope.ledger37AiPreviewDrafts = typeof update === 'function' ? update(scope.ledger37AiPreviewDrafts) : update; });
  for (const name of ['isLedger37AiReadonlyView', 'ledger37AiDisplayScope', 'previewLedger37AiDisplay', 'getLedger37AiDisplayEnabled', 'renderLedger37AiBadge']) {
    scope[name] = (...args: any[]) => expression(name, scope)(...args);
  }
  const renderToggle = (member: any = scope.allBalancesData?.members[0] ?? { userId: 901, name: '成员甲' }) => {
    scope.canManageLedger37Ai = expression('canManageLedger37Ai', scope);
    scope.canPreviewLedger37Ai = expression('canPreviewLedger37Ai', scope);
    return expression('renderLedger37AiToggle', scope)(member);
  };
  const toggle = (member?: any) => nodes(renderToggle(member)).find(node => node.type === 'Switch');
  const badge = (userId = 901) => expression('renderLedger37AiBadge', scope)(userId);
  return { scope, renderToggle, toggle, badge };
}
function pathTo(tree: any, predicate: (node: any) => boolean): any[] | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = pathTo(child, predicate); if (found) return found; }
    return;
  }
  if (!tree || typeof tree !== 'object') return;
  if (predicate(tree)) return [tree];
  const child = pathTo(tree.props?.children, predicate);
  return child ? [tree, ...child] : undefined;
}
function dispatchBubble(path: any[], handler: string) {
  let stopped = false;
  const event = { stopPropagation: vi.fn(() => { stopped = true; }), preventDefault: vi.fn() };
  for (const node of [...path].reverse()) {
    node.props?.[handler]?.(event);
    if (stopped) break;
  }
  return event;
}

describe('ledger37 原用户成员折叠入口：全局 Switch 与只读 Bot 离线 AST 回归', () => {
  it('实际助手输出 Switch role/checked/成员标签，姓名支持 name、nickname、username', () => {
    const h = harness();
    for (const [member, name] of [
      [{ userId: 901, name: '姓名甲', username: '账号甲' }, '姓名甲'],
      [{ userId: 901, nickname: '昵称甲', username: '账号甲' }, '昵称甲'],
      [{ userId: 901, username: '账号甲' }, '账号甲'],
    ] as const) {
      const toggle = h.toggle(member);
      const markup = renderToStaticMarkup(React.createElement(ActualSwitch, toggle.props));
      expect(markup).toContain('role="switch"'); expect(markup).toContain('aria-checked="false"');
      expect(toggle.props.thumbLabel).toBe('AI');
      const actual = ActualSwitch(toggle.props);
      const thumb = nodes(actual).find(node => node.props?.['data-slot'] === 'switch-thumb');
      expect(thumb).toBeTruthy(); expect(thumb.props.children.props.children).toBe('AI');
      expect(thumb.props.children.props['aria-hidden']).toBe('true');
      expect(actual.props).not.toHaveProperty('thumbLabel');
      expect(toggle.props['aria-label']).toBe(`${name}的全局AI视角`);
      expect(toggle.props.checked).toBe(false); expect(toggle.props.disabled).toBe(false);
    }
    h.scope.allBalancesData.balancesMap[901][LEDGER37_AI_DISPLAY_KEY] = 1;
    expect(h.toggle().props.checked).toBe(true);
    expect(renderToStaticMarkup(React.createElement(ActualSwitch, h.toggle().props))).toContain('aria-checked="true"');
  });
  it('onCheckedChange仅以该成员保存真实Switch的新flag，不按标签/lot生成状态', () => {
    const h = harness();
    h.toggle().props.onCheckedChange(true);
    expect(h.scope.saveLedger37AiDisplay).toHaveBeenLastCalledWith(901, true);
    h.scope.allBalancesData.balancesMap[901][LEDGER37_AI_DISPLAY_KEY] = 1;
    h.toggle().props.onCheckedChange(false);
    expect(h.scope.saveLedger37AiDisplay).toHaveBeenLastCalledWith(901, false);
    expect(h.scope.saveLedger37AiDisplay).toHaveBeenCalledTimes(2);
    const handler = declarations.get('renderLedger37AiToggle')!.getText(ast);
    for (const forbidden of ['categoryId', 'lotId', 'setMutation', 'setStockObservationMutation', 'setStockParticipationMutation']) expect(handler).not.toContain(forbidden);
  });
  it('热预览根label无外置AI文字，AI位于Switch.thumbLabel；事件只停止冒泡不阻止label激活', () => {
    const h = harness(); h.scope.isLocalHotPreview = true;
    const root = h.renderToggle(), children = React.Children.toArray(root.props.children) as any[];
    expect(root.type).toBe('label'); expect(root.props['data-ledger37-ai-toggle']).toBe(901);
    expect(children.some(node => node.type === 'span' && node.props.children === 'AI')).toBe(false);
    const toggle = children.find(node => node.type === 'Switch'); expect(toggle).toBeTruthy(); expect(toggle.props.disabled).toBe(false);
    expect(toggle.props.thumbLabel).toBe('AI'); expect(toggle.props.children).toBeUndefined();
    const thumb = nodes(ActualSwitch(toggle.props)).find(node => node.props?.['data-slot'] === 'switch-thumb');
    expect(thumb.props.children.props.children).toBe('AI');
    expect(nodes(root).filter(node => node.type === 'button')).toHaveLength(0);
    for (const node of nodes(root)) expect(node.props?.className ?? '').not.toContain('pointer-events-none');
    expect(renderToStaticMarkup(React.createElement(ActualSwitch, toggle.props))).not.toContain('disabled=""');
    for (const handler of ['onClick', 'onPointerDown']) {
      const parent = { props: { [handler]: vi.fn() } };
      const event = dispatchBubble([parent, root], handler);
      expect(event.stopPropagation).toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled(); expect(parent.props[handler]).not.toHaveBeenCalled();
    }
    expect(toggle.props.onCheckedChange(true)).toBe(true); expect(h.toggle().props.checked).toBe(true); expect(h.badge()).toBeTruthy();
    const unsaved = nodes(h.renderToggle()).find(node => node.props?.['data-ledger37-ai-preview'] === 901);
    expect(unsaved?.props.children).toBe('未保存');
    expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled(); expect(h.scope.setExpandedUsers).not.toHaveBeenCalled();
    expect(h.scope.setSelectedUserId).not.toHaveBeenCalled(); expect(h.scope.setUserDropOpen).not.toHaveBeenCalled();
  });
  it('readonly/无数据禁用；busy按ledger:user隔离，跨标签不分裂checked或busy', () => {
    const h = harness();
    h.scope.window.location.search = '?readonly=1'; expect(h.toggle().props.disabled).toBe(true);
    h.scope.window.location.search = '?viewAs=901'; expect(h.toggle().props.disabled).toBe(true);
    h.scope.window.location.search = ''; h.scope.isLocalHotPreview = true; expect(h.toggle().props.disabled).toBe(false);
    expect(h.scope.canManageLedger37Ai).toBe(false); expect(h.scope.canPreviewLedger37Ai).toBe(true);
    h.scope.isLocalHotPreview = false; h.scope.canAccess = false; expect(h.toggle().props.disabled).toBe(true);
    h.scope.canAccess = true; h.scope.ledger37AiSavingScopes.add('38:901'); expect(h.toggle().props.disabled).toBe(false);
    h.scope.ledger37AiSavingScopes.add('37:901');
    h.scope.allBalancesData.balancesMap[901][LEDGER37_AI_DISPLAY_KEY] = 1;
    for (const categoryId of [90250, 90251]) {
      h.scope.activeStockParticipationCategoryId = categoryId;
      expect(h.toggle().props.checked).toBe(true); expect(h.toggle().props.disabled).toBe(true);
      expect(h.toggle({ userId: 902, username: '成员乙' }).props.disabled).toBe(false);
    }
    h.scope.ledger37AiSavingScopes.clear(); h.scope.allBalancesData = undefined;
    expect(h.toggle().props.disabled).toBe(true); expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled();
  });
  it('false/missing/legacy仅无badge，true有12px不可点击Bot，非37无Switch及badge', () => {
    const h = harness();
    for (const value of [undefined, 0, '1', true]) {
      h.scope.allBalancesData.balancesMap[901] = { [LEDGER37_AI_DISPLAY_KEY]: value, __stockAiDisplay_category_90250: 1 };
      expect(h.badge()).toBeNull();
    }
    h.scope.allBalancesData.balancesMap[901][LEDGER37_AI_DISPLAY_KEY] = 1;
    const badge = h.badge(); expect(badge.type).toBe('Bot'); expect(badge.props.size).toBe(12);
    expect(badge.props['aria-label']).toBe('AI视角'); expect(badge.props.role).toBe('img');
    expect(Object.keys(badge.props).some(name => /^on[A-Z]/.test(name))).toBe(false);
    expect(badge.props.role).not.toBe('button'); expect(h.badge(902)).toBeNull();
    h.scope.ledgerId = 38; expect(h.renderToggle()).toBeNull(); expect(h.badge()).toBeNull();
    expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled();
  });
  it('执行原成员header AST：点击/触摸只停止冒泡，不选用户、不折叠原下拉、不preventDefault', () => {
    const h = harness();
    const toggleCalls = calls.filter(call => call.expression.getText(ast) === 'renderLedger37AiToggle');
    expect(toggleCalls).toHaveLength(1);
    const header = ancestors(toggleCalls[0]).find(node => ts.isJsxElement(node) && attribute(node, 'onClick')?.initializer?.getText(ast) === '{toggleUserExpand}') as ts.JsxElement;
    expect(header).toBeTruthy(); expect(header.openingElement.tagName.getText(ast)).toBe('div');
    Object.assign(h.scope, { member: { userId: 901, name: '成员甲', nickname: '成员甲', username: 'a' }, userId: 901,
      isUserExpanded: true, isDirty: false, isSaving: false, userTagStatusSummary: '共2个', canViewLedger37WalletSnapshot: false,
      handleSaveMember: vi.fn(), setWalletSnapshotUser: vi.fn() });
    h.scope.renderLedger37AiToggle = (member: any) => h.renderToggle(member);
    h.scope.toggleUserExpand = expression('toggleUserExpand', h.scope);
    const tree = execute(header.getText(ast), h.scope);
    expect(header.getText(ast)).not.toContain('renderLedger37AiBadge');
    expect(nodes(tree).filter(node => node.type === 'Bot')).toHaveLength(0);
    const path = pathTo(tree, node => node.type === 'Switch')!; expect(path).toBeTruthy();
    for (const handler of ['onPointerDown', 'onClick']) {
      const event = dispatchBubble(path, handler);
      expect(event.stopPropagation).toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
      expect(h.scope.expandedUsers.has(901)).toBe(true); expect(h.scope.setExpandedUsers).not.toHaveBeenCalled();
      expect(h.scope.setSelectedUserId).not.toHaveBeenCalled(); expect(h.scope.setUserDropOpen).not.toHaveBeenCalled();
      expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled();
    }
    const touch = dispatchBubble(path, 'onTouchEnd');
    expect(touch.preventDefault).not.toHaveBeenCalled(); expect(h.scope.expandedUsers.has(901)).toBe(true);
    nodes(tree).find(node => node.type === 'Switch').props.onCheckedChange(true);
    expect(h.scope.saveLedger37AiDisplay).toHaveBeenCalledWith(901, true);
    const original = dispatchBubble([tree], 'onClick'); expect(original.stopPropagation).not.toHaveBeenCalled();
    expect(h.scope.expandedUsers.has(901)).toBe(false); expect(h.scope.setExpandedUsers).toHaveBeenCalledTimes(1);
  });
  it('原tagDrop AST没有Toggle；成员折叠头部无Badge，各stock成员姓名后仍显示只读Badge', () => {
    const tagDropdown = calls.find(call => ts.isArrowFunction(call.expression) && call.expression.body.getText(ast).includes('const [tagDropOpen, setTagDropOpen]'));
    // Parenthesized IIFE expressions are unwrapped structurally rather than relying on source line numbers.
    const dropdown = tagDropdown ?? calls.find(call => ts.isParenthesizedExpression(call.expression) && call.expression.expression.getText(ast).includes('const [tagDropOpen, setTagDropOpen]'));
    expect(dropdown).toBeTruthy(); expect(dropdown!.getText(ast)).not.toContain('renderLedger37AiToggle');
    expect(declarations.get('renderStockParticipationEditor')!.getText(ast)).not.toContain('renderLedger37AiToggle');
    const badges = calls.filter(call => call.expression.getText(ast) === 'renderLedger37AiBadge');
    expect(badges.some(call => ancestors(call).some(node => ts.isJsxElement(node) && attribute(node, 'onClick')?.initializer?.getText(ast) === '{toggleUserExpand}'))).toBe(false);
    expect(badges.some(call => ancestors(call).some(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'renderStockParticipationEditor'))).toBe(true);
    for (const call of badges) {
      const container = ancestors(call).find(node => ts.isJsxElement(node)) as ts.JsxElement;
      expect(container.getText(ast)).toMatch(/member\.(name|nickname|username)/);
      const names: ts.JsxExpression[] = [];
      const findName = (node: ts.Node) => {
        if (ts.isJsxExpression(node) && node.expression?.getText(ast).match(/member\.(name|nickname|username)/) && !node.expression.getText(ast).includes('renderLedger37AiBadge')) names.push(node);
        ts.forEachChild(node, findName);
      };
      findName(container); expect(names.some(name => name.getStart(ast) < call.getStart(ast))).toBe(true);
    }
  });
  it('普通成员组件新增可选只读aiEnabled:boolean，真实纯UI函数仅展示Bot不新增Switch/mutation', () => {
    const type = ordinaryAst.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'OrdinaryTagInlineMemberRowProps') as ts.TypeAliasDeclaration;
    const field = (type.type as ts.TypeLiteralNode).members.find(node => ts.isPropertySignature(node) && node.name.getText(ordinaryAst) === 'aiEnabled') as ts.PropertySignature;
    expect(field).toBeTruthy(); expect(field.questionToken).toBeTruthy(); expect(field.type?.getText(ordinaryAst)).toBe('boolean');
    expect(ordinarySource).not.toContain('useMutation'); expect(ordinarySource).not.toContain('saveLedger37AiDisplay');
    expect(type.getText(ordinaryAst)).not.toMatch(/onAi|setAi|aiMutation/);
    const fn = ordinaryAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'OrdinaryTagInlineMemberFields') as ts.FunctionDeclaration;
    const render = execute(fn.getText(ordinaryAst).replace(/^export\s+/, ''), {
      Bot: 'Bot', Switch: 'Switch', UserAvatar: 'UserAvatar', Pause: 'Pause', Play: 'Play', Settings2: 'Settings2', OrdinaryTagAllocationFields: 'OrdinaryTagAllocationFields',
    });
    const props = { ledgerId: 37, categoryId: 123, member: { userId: 901, nickname: '成员甲' },
      observation: { enabled: false, initialAmount: '', ratio: '', startDate: '', pauseDate: '' }, actual: { amount: '100', ratio: '20', targetAmount: '20' },
      actualStartDate: '', visible: true, saving: false, accentColor: '#D32F2F', onToggle: vi.fn(), onDetails: vi.fn(), onConfigRead: vi.fn(), onObservationEdit: vi.fn(), onActualEdit: vi.fn() };
    for (const enabled of [undefined, false, true]) {
      const tree = render({ ...props, aiEnabled: enabled });
      const badges = nodes(tree).filter(node => node.type === 'Bot'); expect(badges).toHaveLength(enabled ? 1 : 0);
      const switches = nodes(tree).filter(node => node.type === 'Switch'); expect(switches).toHaveLength(1);
      expect(switches[0].props['aria-label']).toBe('成员甲的普通标签观察');
      for (const badge of badges) {
        expect(badge.props.size).toBe(12); expect(badge.props['aria-label']).toBe('AI视角'); expect(badge.props.role).toBe('img');
        expect(Object.keys(badge.props).some(name => /^on[A-Z]/.test(name))).toBe(false);
      }
    }
    expect(nodes(render({ ...props, ledgerId: 38, aiEnabled: true })).filter(node => node.type === 'Bot')).toHaveLength(0);
    for (const callback of [props.onToggle, props.onDetails, props.onConfigRead, props.onObservationEdit, props.onActualEdit]) expect(callback).not.toHaveBeenCalled();
  });
  it('每处普通成员行只接入userId的只读flag，无tag/lot级AI状态或写入回调', () => {
    const rows = jsx.filter(node => (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText(ast) === 'OrdinaryTagInlineMemberRow');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      const prop = attribute(row, 'aiEnabled'); expect(prop).toBeTruthy();
      const value = (prop!.initializer as ts.JsxExpression).expression!;
      const flags = [false, true];
      for (const enabled of flags) {
        const getter = vi.fn(() => enabled);
        const result = execute(value.getText(ast), { ledgerId: 37, userId: 901, member: { userId: 901 }, getLedger37AiDisplayEnabled: getter });
        expect(result).toBe(enabled); expect(getter).toHaveBeenCalledWith(901);
      }
      expect(value.getText(ast)).not.toMatch(/category|cat\.|lot/);
      const opening = ts.isJsxElement(row) ? row.openingElement : row;
      expect(opening.attributes.properties.some(prop => ts.isJsxAttribute(prop) && /^(onAi|setAi)/.test(prop.name.getText(ast)))).toBe(false);
    }
  });
});
