import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  OrdinaryTagMemberClearSection, clearOrdinaryTagMember, clearedOrdinaryConfig, ordinaryClearConfirmation, ordinaryClearSaveConfirmation,
  ordinaryClearEligibility, ordinaryClearRequest, ordinaryClearScope, ordinaryClearedBalanceKeys,
  patchOrdinaryClearedCache, patchOrdinaryClearedEntry, patchOrdinaryClearScope, validateOrdinaryClearImpact, validateOrdinaryClearRequest, validateOrdinaryClearResult,
  type OrdinaryClearDependencies, type OrdinaryClearImpact, type OrdinaryClearTarget, type OrdinaryTagMemberClearSectionProps,
} from './ordinaryTagMemberClear';
const target: OrdinaryClearTarget = { ledgerId: 37, targetUserId: 101, categoryId: 201, tagName: '普通标签 [甲]."精确"', memberName: '真实成员甲' };
const impact = (days = 2): OrdinaryClearImpact => ({ ledgerId: 37, userId: 101, categoryId: 201, categoryName: target.tagName,
  affectedDays: days, firstDate: days ? '2026-02-01' : null, lastDate: days ? '2026-11-01' : null, impactHash: 'a'.repeat(64), hasConfiguredStartDate: true });
const eligibility = () => ({ ledgerId: 37, canAccess: true, category: { id: 201, name: target.tagName }, savedObservationEnabled: false });
const input = () => ({ target, impact: impact(), eligibility: eligibility(), hasUnsavedTargetChanges: true });
const deps = (): OrdinaryClearDependencies => ({ isDev: false, inFlight: new Set(), confirm: vi.fn(() => true), onStaged: vi.fn(), onBusy: vi.fn() });
const entry = (visible = false) => ({ visible, amount: '99999', ratio: '18.75', targetAmount: '18749.81', startDate: '2026-12-01', pauseDate: '2027-01-01', endDate: '2028-01-01',
  pauseHistory: [{ pauseDate: '2026-12-02' }], margins: [{ id: 'draft-margin', amount: '123', notes: [{ content: '尚未保存' }] }], margin: '789', marginCoin: 'USDT', legacyMarginNoteIds: [7] });
const state = () => ({ 101: { [target.tagName]: entry(), other: entry(true) }, 102: { [target.tagName]: entry(true) } });
function allElements(element: any): ReactElement<any>[] {
  if (!element || typeof element !== 'object' || !element.props) return [];
  const children = Array.isArray(element.props.children) ? element.props.children.flat(Infinity) : [element.props.children];
  return [element, ...children.flatMap(allElements)];
}
const props = (): OrdinaryTagMemberClearSectionProps => ({ target, eligibility: eligibility(), impact: impact(), loading: false, saving: false, conflictingSave: false, isDev: false, onClear: vi.fn(), onRetry: vi.fn() });
const clearButton = (p: OrdinaryTagMemberClearSectionProps) => allElements(OrdinaryTagMemberClearSection(p)).find(el => el.type === 'button' && el.props.onClick === p.onClear)!;

describe('专用清空载荷、精确影响和成功回执', () => {
  it('请求只含scope/hash四字段，必须由精确预检helper生成且不能跨scope', () => {
    const request = ordinaryClearRequest({ ...target, balances: { other: 99 } } as any, impact());
    expect(request).toEqual({ ledgerId: 37, targetUserId: 101, categoryId: 201, impactHash: 'a'.repeat(64) });
    expect(() => validateOrdinaryClearRequest(target, request)).not.toThrow();
    expect(() => validateOrdinaryClearRequest(target, { ...request })).toThrow('未经');
    expect(() => validateOrdinaryClearRequest({ ...target, targetUserId: 102 }, request)).toThrow('匹配');
    expect(Object.keys(ordinaryClearedBalanceKeys(target.tagName))).toHaveLength(4);
  });
  it.each([null, undefined, {}, { ...impact(), affectedDays: -1 }, { ...impact(), affectedDays: 1.5 }, { ...impact(), userId: 102 }, { ...impact(), ledgerId: 52 }, { ...impact(), categoryId: 202 }, { ...impact(), categoryName: '另一个标签' }, { ...impact(), impactHash: '' }, { ...impact(), impactHash: 'unknown' }, { ...impact(), firstDate: '2026-02-30' }, { ...impact(0), firstDate: '2026-01-01' }])('坏预检不能确认或改draft：%j', async invalid => {
    const d = deps(); await expect(clearOrdinaryTagMember({ ...input(), impact: invalid }, d)).rejects.toThrow('影响预检');
    expect(d.confirm).not.toHaveBeenCalled(); expect(d.onStaged).not.toHaveBeenCalled();
  });
  it('N天采用登记日数；0天可暂存，确认清楚说明底部生效且无POST依赖', async () => {
    const confirmation = ordinaryClearConfirmation(target, impact(), true, false);
    expect(confirmation).toContain('真实成员甲'); expect(confirmation).toContain('2 天'); expect(confirmation).not.toContain('273 天');
    expect(confirmation).toContain('待点击详情底部“保存”后生效'); expect(confirmation).toContain('暂停及押金等其他未保存的修改保留');
    const d = deps(); const post = vi.fn(); Object.assign(d, { save: post });
    await clearOrdinaryTagMember({ ...input(), impact: impact(0) }, d);
    expect(post).not.toHaveBeenCalled(); expect(d.onStaged).toHaveBeenCalledWith(target);
    expect(d.confirm).toHaveBeenCalledOnce(); expect(d.confirm).toHaveBeenCalledWith(expect.stringContaining('0 天')); expect(validateOrdinaryClearImpact(target, impact(0)).affectedDays).toBe(0);
    expect(ordinaryClearSaveConfirmation(target, impact(0))).toContain('取消则不提交任何修改');
  });
  it('严格回执：{}、错用户/分类、未成功、非零四字段均拒绝', () => {
    const result = { success: true, ledgerId: 37, userId: 101, categoryId: 201, cleared: clearedOrdinaryConfig() };
    expect(() => validateOrdinaryClearResult(target, result)).not.toThrow();
    for (const bad of [{}, { ...result, success: false }, { ...result, ledgerId: 52 }, { ...result, userId: 102 }, { ...result, categoryId: 202 }, { ...result, cleared: { ...result.cleared, amount: '1' } }, { ...result, cleared: { ...result.cleared, startDate: '2026-01-01' } }]) expect(() => validateOrdinaryClearResult(target, bad)).toThrow('回执');
  });
});

describe('暂存0POST、pending亮、取消/失败保留以及scope草稿隔离', () => {
  it('确认取消不改状态、DEV也只能暂存且绝不调用写入', async () => {
    const d = deps(); d.confirm = vi.fn(() => false); expect(await clearOrdinaryTagMember(input(), d)).toBe(false); expect(d.onStaged).not.toHaveBeenCalled();
    d.isDev = true; d.confirm = vi.fn(() => true); const post = vi.fn(); Object.assign(d, { save: post });
    expect(await clearOrdinaryTagMember(input(), d)).toBe(true); expect(post).not.toHaveBeenCalled(); expect(d.confirm).toHaveBeenCalledWith(expect.stringContaining('不会清空真实数据'));
  });
  it('暂存只改目标四字段+pending+金额dirty，saved/cache及暂停押金其他draft原样保留', async () => {
    let current = state(); const before = structuredClone(current), saved = structuredClone(current), cache = structuredClone(current);
    const otherTag = current[101].other, otherUser = current[102];
    let pending: Record<string, OrdinaryClearTarget> = {}, dirty: Record<string, boolean> = { '37:102:201': true };
    const protectedDrafts = { pausePlans: { '101|target': { pauseDate: '2027-01-01' } }, marginNotes: { target: '未保存' }, observations: { '37:102:202': { enabled: true } } };
    const d = deps(); d.onStaged = staged => { current = patchOrdinaryClearedEntry(current, staged, entry()); pending = patchOrdinaryClearScope(pending, staged, staged); dirty = patchOrdinaryClearScope(dirty, staged, true); };
    expect(await clearOrdinaryTagMember(input(), d)).toBe(true);
    expect(current[101][target.tagName]).toEqual({ ...before[101][target.tagName], ...clearedOrdinaryConfig() });
    expect(current[101].other).toBe(otherTag); expect(current[102]).toBe(otherUser);
    expect(saved).toEqual(before); expect(cache).toEqual(before); expect(pending[ordinaryClearScope(target)]).toEqual(target); expect(dirty[ordinaryClearScope(target)]).toBe(true);
    expect(protectedDrafts.pausePlans['101|target'].pauseDate).toBe('2027-01-01'); expect(protectedDrafts.marginNotes.target).toBe('未保存');
  });
  it('确认期间重复点击只暂存一次，错误保持锁释放', async () => {
    const d = deps(); let reentry!: Promise<boolean>;
    d.confirm = vi.fn(() => { reentry = clearOrdinaryTagMember(input(), d); return true; });
    expect(await clearOrdinaryTagMember(input(), d)).toBe(true); expect(await reentry).toBe(false); expect(d.onStaged).toHaveBeenCalledOnce(); expect(d.inFlight.size).toBe(0);
    d.onStaged = vi.fn(() => { throw new Error('本地失败'); }); await expect(clearOrdinaryTagMember(input(), d)).rejects.toThrow('本地失败'); expect(d.inFlight.size).toBe(0);
  });
  it('query cache只目标四键且输入和其他缓存对象不变', () => {
    const cache = { members: [{ userId: 101 }], balancesMap: { 101: { [target.tagName]: 9876, [`${target.tagName}__visible`]: 0, [`${target.tagName}__pauseHistory`]: 'pause', [`${target.tagName}__margins`]: 'margin', other: 123 }, 102: { [target.tagName]: 4321 } }, marginNotesMap: { note: [1] } };
    const before = structuredClone(cache), next = patchOrdinaryClearedCache(cache, target)!;
    expect(next.balancesMap[101]).toEqual({ ...before.balancesMap[101], ...ordinaryClearedBalanceKeys(target.tagName) });
    expect(next.balancesMap[102]).toBe(cache.balancesMap[102]); expect(next.members).toBe(cache.members); expect(next.marginNotesMap).toBe(cache.marginNotesMap); expect(cache).toEqual(before);
  });
});

describe('独立两字小节UI与观察权限', () => {
  it.each([{ ledgerId: 52 }, { canAccess: false }, { category: null }, { category: { id: 201, name: target.tagName, accountingMode: 'stock_portfolio' } }, { category: { id: 201, name: target.tagName, accounting_mode: 'stock_portfolio' } }])('非授权普通37不显示入口：%j', override => {
    expect(OrdinaryTagMemberClearSection({ ...props(), eligibility: { ...eligibility(), ...override } })).toBeNull();
  });
  it.each([{ savedObservationEnabled: true }, { savedObservationEnabled: true, observationDraftEnabled: false }, { savedObservationEnabled: false, observationDraftEnabled: true }])('观察或未保存切换禁止确认：%j', async observation => {
    const d = deps(), p = { ...props(), eligibility: { ...eligibility(), ...observation } };
    expect(ordinaryClearEligibility(p.eligibility).observationBlocked).toBe(true); await expect(clearOrdinaryTagMember({ ...input(), eligibility: p.eligibility }, d)).rejects.toThrow('观察'); expect(d.confirm).not.toHaveBeenCalled();
  });
  it.each([{ loading: true }, { saving: true }, { conflictingSave: true }])('预检保存锁住：%j', override => expect(clearButton({ ...props(), ...override }).props.disabled).toBe(true));
  it('平时只有清空两字，不常驻说明', () => {
    const p = props(); expect(clearButton(p).props.children).toBe('清空'); const html = renderToStaticMarkup(createElement(OrdinaryTagMemberClearSection, p));
    expect(html).not.toContain('收益登记天数'); expect(html).not.toContain('不删除'); clearButton(p).props.onClick(); expect(p.onClear).toHaveBeenCalledOnce();
  });
});

describe('页面AST接线验证（纯离线）', () => {
  const source = readFileSync(new URL('../pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function nodes(node: ts.Node): ts.Node[] { return [node, ...node.getChildren(ast).flatMap(nodes)]; }
  const all = nodes(ast);
  const initializer = (name: string) => all.find((node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText(ast) === name)?.initializer;
  it('按钮只有fresh预检和staged，所有基线/cache补丁只在底部成功确认', () => {
    const text = initializer('handleClearOrdinaryMember')!.getText(ast);
    expect(text).toContain('await ordinaryClearImpactQuery.refetch()'); expect(text).toContain('onStaged:'); expect(text).toContain('setOrdinaryActualDirty');
    for (const forbidden of ['mutateAsync', 'setOrdinaryActualSaved', 'ordinaryDetailSavedEntriesRef', 'ordinaryClearedConfigsRef', 'setData(', 'setDirtyUsers', 'setPauseWalletPlans', 'setMarginNoteDrafts']) expect(text).not.toContain(forbidden);
    const ack = initializer('acknowledgeOrdinaryMemberClear')!.getText(ast);
    expect(ack).toContain('patchOrdinaryClearedCache'); expect(ack).toContain('patchOrdinaryClearedEntry'); expect(ack).toContain('cancelPendingOrdinaryClear'); expect(ack).not.toContain('refetch');
    const save = initializer('handleSaveOrdinaryDetail')!.getText(ast);
    expect(save).toContain('saveClear:'); expect(save).toContain('ordinaryClearMutation.mutateAsync(input)'); expect(save).toContain('onClearSaved: () => acknowledgeOrdinaryMemberClear');
    expect(save).not.toContain('ordinaryClearSaveConfirmation');
    const saveCalls = nodes(initializer('handleSaveOrdinaryDetail')!).filter(ts.isCallExpression).map(node => node.expression.getText(ast));
    expect(saveCalls.filter(call => call === 'window.confirm')).toHaveLength(1);
    expect(save).toContain('confirm: message => window.confirm(message)'); // Only the helper's independent observation/wallet actions may use this callback.
  });
  it('首次确认保存fresh hash；底部必须再次fresh预检并比对原确认hash，检查早于建计划和任何写入', () => {
    const stage = initializer('handleClearOrdinaryMember')!.getText(ast);
    expect(stage).toContain('ordinaryConfirmedClearHashesRef.current[ordinaryClearScope(stagedTarget)] = validateOrdinaryClearImpact(stagedTarget, fresh.data).impactHash');
    const save = initializer('handleSaveOrdinaryDetail')!.getText(ast);
    const checks = [
      'await (queryUtils.client as any).ledger.adminGetOrdinaryTagClearImpact.query({ ledgerId: 37, targetUserId: userId, categoryId })',
      'validateOrdinaryClearImpact(current.pendingClear, freshImpact)',
      'ordinaryConfirmedClearHashesRef.current[scope] !== clearImpact.impactHash',
      'clearRequest = ordinaryClearRequest(current.pendingClear, clearImpact)',
      'plan = buildOrdinaryDetailSavePlan',
      'await saveOrdinaryDetail',
    ];
    let previous = -1;
    for (const check of checks) { const index = save.indexOf(check); expect(index, check).toBeGreaterThan(previous); previous = index; }
    expect(save).toMatch(/if \(ordinaryConfirmedClearHashesRef\.current\[scope\] !== clearImpact\.impactHash\) throw new Error/);
    expect(save).not.toContain('ordinaryClearImpactQuery.data'); expect(save).not.toContain('ordinaryConfirmedClearHashesRef.current[scope] =');
    expect(initializer('cancelPendingOrdinaryClear')!.getText(ast)).toContain('delete ordinaryConfirmedClearHashesRef.current[scope]');
    const saveBody = (initializer('handleSaveOrdinaryDetail') as ts.ArrowFunction).body as ts.Block;
    const catchBlock = saveBody.statements.find(ts.isTryStatement)!.catchClause!.block.getText(ast);
    expect(catchBlock).toContain('return false');
    for (const forbidden of ['acknowledgeOrdinaryMemberClear', 'cancelPendingOrdinaryClear', 'setTagEditModal', 'setEditState', 'setOrdinaryActualSaved']) expect(catchBlock).not.toContain(forbidden);
  });
  it('pending接入真实详情dirty及底部禁用，成功才关闭，失败和重复保存保持详情', async () => {
    expect(initializer('ordinaryDetailSnapshot')!.getText(ast)).toContain('pendingClear: saved ? null : ordinaryPendingClearsRef.current[scope] ?? null');
    expect(initializer('ordinaryDetailIsDirty')!.getText(ast)).toContain('ordinaryDetailIsChanged');
    expect(initializer('detailChanged')!.getText(ast)).toContain('ordinaryDetailIsDirty(userId, category)');
    expect(initializer('saveDisabled')!.getText(ast)).toContain('!detailChanged');
    const conditional = all.find((node): node is ts.IfStatement => ts.isIfStatement(node) && node.expression.getText(ast) === 'isOrdinaryDetail'
      && node.thenStatement.getText(ast).includes('if (await handleSaveOrdinaryDetail(userId, category))'))!;
    expect(conditional).toBeDefined();
    const body = ts.transpileModule(`async function callback() { ${conditional.getText(ast)} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    for (const complete of [true, false]) {
      const save = vi.fn(async () => complete), close = vi.fn(), reset = vi.fn();
      const callback = new Function('isOrdinaryDetail', 'handleSaveOrdinaryDetail', 'userId', 'category', 'setTagEditModal', 'setTargetTotalInput', `${body}; return callback;`)(true, save, 101, { id: 201 }, close, reset);
      await callback(); expect(save).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledWith(101, { id: 201 });
      if (complete) { expect(close).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledWith(null); expect(reset).toHaveBeenCalledOnce(); expect(reset).toHaveBeenCalledWith(''); }
      else { expect(close).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled(); }
    }
  });
  it('同标签/成员上方保存阻断pending，字段及观察编辑撤销pending', () => {
    expect(initializer('handleSaveOrdinaryTag')!.getText(ast)).toContain('ordinaryPendingClearsRef.current');
    const memberSave = initializer('handleSaveMember')!.getText(ast);
    expect(memberSave).toContain('Object.values(ordinaryPendingClearsRef.current).some(target => target.ledgerId === ledgerId && target.targetUserId === userId)');
    expect(memberSave).toMatch(/if \(Object\.values\(ordinaryPendingClearsRef\.current\)[^\n]+return false;/);
    expect(initializer('updateEntry')!.getText(ast)).toContain('cancelPendingOrdinaryClear'); expect(initializer('editOrdinaryObservation')!.getText(ast)).toContain('cancelPendingOrdinaryClear');
  });
  it('关闭和遮罩共用确认且ref锁预检/保存，DEV不能真实清空，原资金守卫保留', () => {
    const close = initializer('closeTagEditModal')!.getText(ast);
    expect(close).toContain('ordinaryDetailPreflightInFlight.current.has(scope)'); expect(close).toContain('ordinaryDetailSaveInFlight.current.has(scope)'); expect(close).toContain('ordinaryDetailIsDirty'); expect(close).toContain('window.confirm'); expect(close).not.toContain('mutateAsync');
    expect(source.match(/onClick={closeTagEditModal}/g)).toHaveLength(2);
    expect(initializer('handleSaveOrdinaryDetail')!.getText(ast)).toContain('isLocalHotPreview || capabilities?.configSave === false');
    expect(initializer('handleSaveOrdinaryDetail')!.getText(ast)).toContain('isLocalHotPreview || capabilities?.walletActions === false');
    expect(source).toContain('renderOrdinaryTagEditor(userId, category, member, true)');
  });
});

describe('押金按钮权限防闪动静态回归（纯离线）', () => {
  const source = readFileSync(new URL('../pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('detail.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let permission: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'canManageMargins') permission = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const expression = permission!.getText(ast);
  const canManage = new Function('ledgerId', 'marginActorPermission', `return (${expression});`);
  const verified = () => ({ isFetchedAfterMount: true, isFetching: false, error: null, data: { canManageMargins: true, operator: { id: 870413 } } });
  it('后台isFetching不卸载已核验按钮，仍依赖目标scope的真实operator权限', () => {
    expect(expression).not.toContain('isFetching'); expect(expression).not.toContain('viewAsUserId'); expect(expression).not.toContain('user?.id');
    expect(canManage(37, verified())).toBe(true); expect(canManage(37, { ...verified(), isFetching: true })).toBe(true);
    expect(source).toContain('{ ledgerId: 37, targetUserId: marginTargetUserId }');
    expect(source).toContain('{canManageMargins && (');
  });
  it('首次未核验、失败、其他账本及非真实授权operator仍隐藏，不扩大资金权限', () => {
    for (const state of [{ ...verified(), isFetchedAfterMount: false }, { ...verified(), error: new Error('权限查询失败') },
      { ...verified(), data: undefined }, { ...verified(), data: { canManageMargins: false, operator: { id: 870413 } } },
      { ...verified(), data: { canManageMargins: true, operator: { id: 101 } } }]) expect(canManage(37, state)).toBeFalsy();
    expect(canManage(52, verified())).toBe(false);
  });
});
