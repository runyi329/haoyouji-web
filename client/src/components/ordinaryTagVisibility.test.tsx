import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { OrdinaryTagInlineMemberFields, type OrdinaryTagInlineMemberRowProps } from './OrdinaryTagInlineMemberRow';
import { ordinaryTagVisibilityPayload, ordinaryVisibilityScope, patchOrdinaryTagVisible, patchOrdinaryVisibilityCache, saveOrdinaryTagVisibility } from './ordinaryTagVisibility';

vi.mock('@/lib/trpc', () => ({ trpc: {} }));
vi.mock('@/components/UserAvatar', () => ({ UserAvatar: (props: any) => createElement('span', { 'data-avatar': props.username }, props.nickname || props.username) }));
const page = readFileSync(new URL('../pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
const props = (): OrdinaryTagInlineMemberRowProps => ({ ledgerId: 37, categoryId: 201, member: { userId: 101, nickname: '成员甲' },
  observation: { enabled: true, initialAmount: '9000', ratio: '77', startDate: '2026-11-01', pauseDate: '' },
  actual: { amount: '10000', ratio: '20', targetAmount: '2000' }, actualStartDate: '2026-11-01',
  visible: true, saving: false, accentColor: '#D32F2F', onConfigRead: vi.fn(), onToggle: vi.fn(), onObservationEdit: vi.fn(),
  onActualEdit: vi.fn(), onDetails: vi.fn(), onToggleVisibility: vi.fn(), onDateDetails: vi.fn() });
function descendants(element: any): ReactElement<any>[] {
  if (!element || typeof element !== 'object' || !element.props) return [];
  const children = Array.isArray(element.props.children) ? element.props.children.flat(Infinity) : [element.props.children];
  return [element, ...children.flatMap(descendants)];
}
const input = (visible = false) => ({ ledgerId: 37, targetUserId: 101, tagName: '普通标签', visible });
const draftEntry = (visible = true) => ({ visible, amount: '99999', ratio: '18.75', targetAmount: '18749.81', startDate: '2026-12-01',
  margins: [{ id: 'draft-margin', amount: '123', notes: [{ content: '尚未保存' }] }], pauseHistory: [{ pauseDate: '2026-12-02' }] });
const makeState = () => ({ 101: { '普通标签': draftEntry(), '其它标签': draftEntry(false) }, 102: { '普通标签': draftEntry() } });

describe('37普通标签头像与详情入口分离', () => {
  it.each([true, false])('visible=%s头像只调用visibility，详情链接仅打开详情，金额观察均不被调用', visible => {
    const p = { ...props(), visible };
    const all = descendants(OrdinaryTagInlineMemberFields(p));
    const avatar = all.find(item => item.props['aria-label'] === `${visible ? '隐藏' : '显示'}成员甲的标签`)!;
    avatar.props.onClick();
    expect(p.onToggleVisibility).toHaveBeenCalledOnce(); expect(p.onDetails).not.toHaveBeenCalled();
    for (const callback of [p.onToggle, p.onObservationEdit, p.onActualEdit, p.onDateDetails]) expect(callback).not.toHaveBeenCalled();
    const details = all.find(item => item.type === 'button' && item.props.className?.includes('shrink-0 items-center gap-0.5'))!;
    details.props.onClick(); expect(p.onDetails).toHaveBeenCalledOnce(); expect(p.onDateDetails).not.toHaveBeenCalled();
  });
  it('正在保存的对应头像禁用防重复，不将可见性保存混入金额草稿', () => {
    const p = { ...props(), visibilitySaving: true };
    expect(descendants(OrdinaryTagInlineMemberFields(p)).find(item => item.props['aria-label'] === '隐藏成员甲的标签')?.props.disabled).toBe(true);
    expect(renderToStaticMarkup(createElement(OrdinaryTagInlineMemberFields, p))).toContain('disabled=""');
  });
  it.each([52, 99])('非37账本%s不传新prop时仍调用原onDetails', ledgerId => {
    const p = { ...props(), ledgerId }; delete p.onToggleVisibility;
    descendants(OrdinaryTagInlineMemberFields(p)).find(item => item.props['aria-label'] === '查看成员甲详细设置')!.props.onClick();
    expect(p.onDetails).toHaveBeenCalledOnce(); expect(p.onActualEdit).not.toHaveBeenCalled();
  });
});

describe('独立可见性载荷与草稿隔离', () => {
  it.each([true, false])('visible=%s严格只有目标用户本tag的__visible字段，不能夹带其它配置', visible => {
    const polluted = { ...input(visible), amount: 888, ratio: 30, observation: true, margins: [123], date: '2026-01-01', impactHash: 'fresh-hash' };
    expect(ordinaryTagVisibilityPayload(polluted)).toEqual({ ledgerId: 37, targetUserId: 101,
      balances: { '普通标签__visible': visible ? 1 : 0 }, migratedMarginNoteIds: [],
      hideAcknowledgements: visible ? [] : [{ tagName: '普通标签', impactHash: 'fresh-hash' }] });
  });
  it('财务记录必须有impactHash；无hash不允许进入任何保存或DEV更新', async () => {
    const save = vi.fn(), updateVisible = vi.fn(), onSaved = vi.fn();
    await expect(saveOrdinaryTagVisibility({ ...input(), hasFinancialRecords: true }, { isDev: true, previousVisible: true, save, updateVisible, onSaved })).rejects.toThrow('两次隐藏确认');
    expect(save).not.toHaveBeenCalled(); expect(updateVisible).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
    expect(ordinaryTagVisibilityPayload({ ...input(), hasFinancialRecords: true, impactHash: 'confirmed-snapshot' }).hideAcknowledgements).toEqual([{ tagName: '普通标签', impactHash: 'confirmed-snapshot' }]);
  });
  it('同scope存在金额观察草稿、其它tag及其它人草稿时仍可hide，全部非visibility字段和dirty标记保留', async () => {
    let state = makeState(); const before = structuredClone(state);
    const observations = { '37:101:201': props().observation, '37:102:202': { ...props().observation, ratio: '88' } };
    const observationsBefore = structuredClone(observations);
    const dirtyUsers = new Set([101, 102]); const actualDirty = { '37:101:201': true, '37:101:202': true };
    const save = vi.fn().mockResolvedValue({ success: true });
    await saveOrdinaryTagVisibility({ ...input(), impactHash: 'risk-hash' }, { isDev: false, previousVisible: true, save,
      updateVisible: visible => { state = patchOrdinaryTagVisible(state, 101, '普通标签', visible, draftEntry()); }, onSaved: vi.fn() });
    expect(state).toEqual({ ...before, 101: { ...before[101], '普通标签': { ...before[101]['普通标签'], visible: false } } });
    expect(state[102]).toBeDefined(); expect(observations).toEqual(observationsBefore);
    expect(dirtyUsers).toEqual(new Set([101, 102])); expect(actualDirty).toEqual({ '37:101:201': true, '37:101:202': true });
    expect(save).toHaveBeenCalledOnce(); expect(Object.keys(save.mock.calls[0][0].balances)).toEqual(['普通标签__visible']);
  });
  it('服务器尚未确认时不触发成功提示，只有await保存成功才触发onSaved', async () => {
    let resolveSave!: () => void;
    const pending = new Promise<void>(resolve => { resolveSave = resolve; });
    const onSaved = vi.fn(), updateVisible = vi.fn();
    const result = saveOrdinaryTagVisibility(input(), { isDev: false, previousVisible: true, save: () => pending, updateVisible, onSaved });
    expect(updateVisible).toHaveBeenCalledWith(false); expect(onSaved).not.toHaveBeenCalled();
    resolveSave(); await result; expect(onSaved).toHaveBeenCalledOnce();
  });
  it.each([true, false])('visible=%s失败只回滚visible，保存中继续编辑的日期押金及其它tag草稿也保留', async visible => {
    let state = makeState(); state[101]['普通标签'].visible = !visible;
    const save = vi.fn(async () => {
      state = { ...state, 101: { ...state[101], '普通标签': { ...state[101]['普通标签'], startDate: '2027-01-01' } } };
      throw new Error('服务端拒绝');
    });
    const onSaved = vi.fn();
    await expect(saveOrdinaryTagVisibility(input(visible), { isDev: false, previousVisible: !visible, save, onSaved,
      updateVisible: next => { state = patchOrdinaryTagVisible(state, 101, '普通标签', next, draftEntry()); } })).rejects.toThrow('服务端拒绝');
    expect(state[101]['普通标签']).toEqual({ ...draftEntry(!visible), startDate: '2027-01-01' });
    expect(state[101]['其它标签']).toEqual(draftEntry(false)); expect(state[102]['普通标签']).toEqual(draftEntry());
    expect(onSaved).not.toHaveBeenCalled();
  });
  it.each([true, false])('DEV visible=%s零POST，只改本地visible，不运行服务端成功提示或写querycache', async visible => {
    const save = vi.fn().mockRejectedValue(new Error('不应发送POST')), updateVisible = vi.fn(), onSaved = vi.fn();
    await saveOrdinaryTagVisibility({ ...input(visible), hasFinancialRecords: true, impactHash: 'real-risk-hash' }, { isDev: true, previousVisible: !visible, save, updateVisible, onSaved });
    expect(save).not.toHaveBeenCalled(); expect(updateVisible).toHaveBeenCalledOnce(); expect(updateVisible).toHaveBeenCalledWith(visible); expect(onSaved).not.toHaveBeenCalled();
  });
  it('querycache只更新本用户本标签visible，其它缓存字段原样且不污染输入', () => {
    const previous = { members: [{ userId: 101 }], balancesMap: { 101: { '普通标签': 10000, '普通标签__visible': 1, '普通标签__ratio': 20, '普通标签__startDate': '2026-11-01', '普通标签__margins': 'saved', '其它标签__visible': 0 }, 102: { '普通标签__visible': 1 } }, marginNotesMap: { legacy: [1] } };
    const next = patchOrdinaryVisibilityCache(previous, input())!;
    expect(next).toEqual({ ...previous, balancesMap: { ...previous.balancesMap, 101: { ...previous.balancesMap[101], '普通标签__visible': 0 } } });
    expect(previous.balancesMap[101]['普通标签__visible']).toBe(1); expect(next.balancesMap[102]).toBe(previous.balancesMap[102]);
    expect(next.members).toBe(previous.members); expect(next.marginNotesMap).toBe(previous.marginNotesMap);
  });
  it('非法用户/其它账本拒绝，scope按user/tag隔离', () => {
    expect(() => ordinaryTagVisibilityPayload({ ...input(), ledgerId: 52 })).toThrow();
    expect(() => ordinaryTagVisibilityPayload({ ...input(), targetUserId: 0 })).toThrow();
    expect(new Set([ordinaryVisibilityScope(101, '甲'), ordinaryVisibilityScope(101, '乙'), ordinaryVisibilityScope(102, '甲')]).size).toBe(3);
  });
});

describe('页面最小范围接线与资金保护', () => {
  it('独立mutation与helper成功只更新scope/cache，不调用全成员保存、不清dirty、不refetch、不触发资金流程', () => {
    const save = page.slice(page.indexOf('const saveOrdinaryVisibility ='), page.indexOf('const stageOrdinaryVisibility ='));
    expect(page).toContain('const visibilityMutation = trpc.ledger.adminSetMemberInitialBalances.useMutation();');
    expect(save).toContain('save: payload => visibilityMutation.mutateAsync(payload)');
    expect(save).toContain('patchOrdinaryTagVisible'); expect(save).toContain('patchOrdinaryVisibilityCache');
    expect(save).toContain('visibilitySavingRef.current.has(scope)'); expect(save).toContain('isDev: isLocalHotPreview');
    for (const forbidden of ['handleSaveMember(', 'setMutation.mutate', 'refetch()', 'setDirtyUsers(', 'ordinaryTagIsDirty(', 'setOrdinaryObservationDrafts(', 'setOrdinaryActualDirty(', 'settlePausedTagMutation', 'releasePausedTagMarginsMutation']) expect(save).not.toContain(forbidden);
    expect(page).toContain('if (visibilityCachePatchRef.current === allBalancesData) return;');
    expect(save.indexOf('toast.success')).toBeGreaterThan(save.indexOf('onSaved: () =>'));
  });
  it('头像nonbatch即时、batch独立草稿；详情按钮无切换，详情头部仅37普通走即时', () => {
    const row = page.slice(page.indexOf('if (ledgerId === 37 && cat) {'), page.indexOf('const pct = ratio;'));
    expect(row).toContain("requestTagVisibilityChange(member.userId, cat.name, !visible, 'immediate')");
    expect(row).toContain("requestTagVisibilityChange(member.userId, cat.name, !currentVisible, 'draft')");
    expect(row).toContain('ordinaryVisibilityDrafts[ordinaryVisibilityScope(member.userId, cat.name)]');
    const detail = row.slice(row.indexOf('onDetails={() =>'));
    expect(detail).toContain('setTagEditModal'); expect(detail).not.toContain('requestTagVisibilityChange');
    expect(page).toContain("requestTagVisibilityChange(userId, tagName, !entry.visible, ledgerId === 37 && !isStockTag ? 'immediate' : 'draft')");
    expect(page).toContain('visibilitySaving={batchSaving || savingUsers.has(member.userId) || isVisibilityBusy(member.userId, cat.name)}');
  });
  it('批量仅selected scope单字段逐一await，失败保留草稿，不走handleSaveMember或提前成功提示', () => {
    const batch = page.slice(page.indexOf('const saveOrdinaryVisibilityBatch ='), page.indexOf('// 标签下拉框开关'));
    expect(batch).toContain('Array.from(batchSelectedUsers)'); expect(batch).toContain('ordinaryVisibilityDrafts[scope]');
    expect(batch).toContain('if (!await saveOrdinaryVisibility(userId, tagName, visible, hideAcknowledgements[scope])) return;');
    expect(batch).not.toContain('handleSaveMember'); expect(batch).not.toContain('toast.success');
    const cancel = page.slice(page.indexOf('const cancelOrdinaryVisibilityBatch ='), page.indexOf('const saveOrdinaryVisibilityBatch ='));
    for (const forbidden of ['refetch', 'setEditState', 'setDirtyUsers', 'setOrdinaryObservationDrafts']) expect(cancel).not.toContain(forbidden);
    expect(page).toContain("if (ledgerId === 37 && !isStockPortfolioTag(cat)) { void saveOrdinaryVisibilityBatch(selectedTagName); return; }");
  });
  it('DEV继续读取真实impact，财务记录保留first→final和hash；草稿不谎称已生效', () => {
    expect(page).toContain('trpc.ledger.adminGetMemberTagHideImpact.useQuery(');
    expect(page).toContain("setHideConfirmation({ userId, tagName, mode, stage: 'loading' })");
    expect(page).toContain('if (hideImpactQuery.isFetching) return;'); expect(page).toContain('if (impact.hasFinancialRecords)');
    expect(page).toContain("stage: 'first'"); expect(page).toContain("stage: 'final'");
    expect(page).toContain('if (!impact?.impactHash)'); expect(page).toContain('applyConfirmedTagHide(hideConfirmation, String(impact.impactHash))');
    expect(page).toContain('显示设置草稿已修改，点击批量保存后生效'); expect(page).toContain('该用户已不可见此标签');
    const impactEffect = page.slice(page.indexOf("if (!hideConfirmation || hideConfirmation.stage !== 'loading')"), page.indexOf('// 比例、初始金额、实际占用金额三联动'));
    expect(impactEffect).not.toContain('isLocalHotPreview'); expect(impactEffect).not.toContain('toast.success');
  });
  it('非37和股票原可见性保存分支保留，通用金额日期保护未绕过或自动处理草稿', () => {
    expect(page).toContain("const saveStockTagVisibility = (targetUserId: number, tagName: string, nextVisible: boolean) => {\n    requestTagVisibilityChange(targetUserId, tagName, nextVisible, 'immediate');\n  }");
    const hide = page.slice(page.indexOf('const applyConfirmedTagHide ='), page.indexOf('const requestTagVisibilityChange ='));
    expect(hide).toContain('if (isOrdinaryVisibilityTag(tagName))'); expect(hide).toContain('setMutation.mutate({');
    expect(page).toContain('if (ledgerId === 37 && categories.some((category: any) => !isStockPortfolioTag(category) && ordinaryTagIsDirty(category)))');
    expect(page).toContain('请先保存或取消金额与观察修改');
  });
});
