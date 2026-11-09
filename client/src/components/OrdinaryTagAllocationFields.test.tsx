import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import OrdinaryTagAllocationFields, { ordinaryCompactDate, type OrdinaryTagAllocationFieldsProps } from "./OrdinaryTagAllocationFields";
import { OrdinaryTagInlineMemberFields, type OrdinaryTagInlineMemberRowProps } from "./OrdinaryTagInlineMemberRow";

vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/components/UserAvatar", () => ({ UserAvatar: (props: any) => createElement("span", { "data-avatar": props.username }, props.nickname || props.username) }));
const actual = { amount: "975951.89", ratio: "20", targetAmount: "195190.38" };
const fieldProps = (): OrdinaryTagAllocationFieldsProps => ({ name: "成员甲", observing: false, initialAmount: actual.amount,
  targetAmount: actual.targetAmount, ratio: actual.ratio, startDate: "2026-11-01", pauseDate: "2026-11-09", remainingRatio: 35,
  onInitialAmountChange: vi.fn(), onTargetAmountChange: vi.fn(), onRatioChange: vi.fn(), onStartDateChange: vi.fn(), onPauseDateChange: vi.fn(), onOpenDateDetails: vi.fn() });
const rowProps = (): OrdinaryTagInlineMemberRowProps => ({ ledgerId: 37, categoryId: 201, member: { userId: 101, username: "member", nickname: "成员甲" },
  actual, observation: { enabled: false, initialAmount: "", ratio: "", startDate: "", pauseDate: "" }, actualStartDate: "2026-11-01", actualPauseDate: "2026-11-09",
  remainingRatio: 35, pauseStatus: "paused", visible: true, saving: false, accentColor: "#D32F2F", onConfigRead: vi.fn(), onToggle: vi.fn(),
  onObservationEdit: vi.fn(), onActualEdit: vi.fn(), onDetails: vi.fn() });
function descendants(element: any): ReactElement<any>[] {
  if (!element || typeof element !== "object" || !element.props) return [];
  const children = Array.isArray(element.props.children) ? element.props.children.flat(Infinity) : [element.props.children];
  return [element, ...children.flatMap(descendants)];
}
const page = readFileSync(new URL("../pages/LedgerAAInitialBalance.tsx", import.meta.url), "utf8");

describe("普通标签统一股票同款布局", () => {
  it("姓名观察在首行，下方第一行初始/开始/暂停，第二行剩余、分配、±比例，无股数或重复金额", () => {
    const html = renderToStaticMarkup(createElement(OrdinaryTagInlineMemberFields, rowProps()));
    const headerEnd = html.indexOf('data-ordinary-allocation-fields');
    expect(html.slice(0, headerEnd)).toContain('普通标签观察');
    expect(html.slice(0, headerEnd)).not.toContain('减少真实比例');
    expect(html.indexOf('reference-dates')).toBeLessThan(html.indexOf('allocation-ratio'));
    expect(html.indexOf('真实初始金额')).toBeLessThan(html.indexOf('真实开始日期'));
    expect(html.indexOf('真实开始日期')).toBeLessThan(html.indexOf('真实暂停日期'));
    expect(html.indexOf('剩余 35%')).toBeLessThan(html.indexOf('真实分配金额'));
    expect(html.indexOf('真实分配金额')).toBeLessThan(html.indexOf('减少真实比例'));
    expect(html.match(/inputMode="decimal"/g)).toHaveLength(3);
    expect(html).not.toContain('股数');
    expect(html).not.toContain('真实权益');
  });
  it("全部控件28px/3px/白底浅蓝边框，真实灰字、观察紫字，金额与比例右对齐", () => {
    const actualHtml = renderToStaticMarkup(createElement(OrdinaryTagAllocationFields, fieldProps()));
    expect(actualHtml).toContain('h-7'); expect(actualHtml).toContain('rounded-[3px]'); expect(actualHtml).toContain('bg-white');
    expect(actualHtml).toContain('border-color:#D9E8EE'); expect(actualHtml).toContain('color:#4B5563');
    expect(actualHtml).toContain('text-right'); expect(actualHtml).not.toContain('#D32F2F');
    const observedHtml = renderToStaticMarkup(createElement(OrdinaryTagAllocationFields, { ...fieldProps(), observing: true }));
    expect(observedHtml).toContain('color:#7C3AED'); expect(observedHtml).toContain('border-color:#D9E8EE');
  });
  it.each([320, 375])("%ipx最窄展开区：两行共享可收缩三列，九位金额完整值并适配10px", viewport => {
    const tree = OrdinaryTagAllocationFields(fieldProps());
    const rows = descendants(tree).filter(item => item.props['data-ordinary-allocation-row']);
    expect(rows).toHaveLength(2);
    expect(rows[0].props.style.gridTemplateColumns).toBe(rows[1].props.style.gridTemplateColumns);
    for (const row of rows) {
      expect(row.props.className).toContain('w-full max-w-[264px]');
      expect(row.props.style.gridTemplateColumns).not.toMatch(/\d+px/);
    }
    const span = descendants(tree).find(item => item.props['data-ordinary-allocation-span']);
    expect(span?.props.className).toContain('col-span-2');
    // 页面卡片左右32px、展开内边距24px、行内边距16px；minmax(0,fr)不产生固定最小宽度。
    const available = Math.min(264, viewport - 32 - 24 - 16);
    const initialColumn = (available - 12) * 1.15 / 3.15;
    expect(initialColumn).toBeGreaterThan(72);
    const html = renderToStaticMarkup(tree);
    for (const value of [actual.amount, actual.targetAmount]) expect(html).toContain(`value="${value}"`);
    const moneyInputs = descendants(tree).filter(item => item.type === 'input' && item.props.inputMode === 'decimal' && item.props.style?.fontSize);
    expect(moneyInputs).toHaveLength(2);
    for (const input of moneyInputs) { expect(input.props.style.fontSize).toBe('10px'); expect(input.props.className).not.toContain('truncate'); }
  });
  it("超长历史精度金额只适配字号，不四舍五入或截断原值", () => {
    const tree = OrdinaryTagAllocationFields({ ...fieldProps(), initialAmount: '975951.893333' });
    const input = descendants(tree).find(item => item.props['aria-label'] === '成员甲的真实初始金额')!;
    expect(input.props.value).toBe('975951.893333');
    expect(input.props.style.fontSize).toBe('9px');
    expect(renderToStaticMarkup(tree)).toContain('value="975951.893333"');
  });
  it("日期仅遮罩显示YY/MM/DD，真实列表点日期只开详情，详情日期只是转发原草稿回调", () => {
    expect(ordinaryCompactDate('2026-11-09')).toBe('26/11/09'); expect(ordinaryCompactDate('')).toBe('');
    const props = fieldProps(); delete props.onStartDateChange; delete props.onPauseDateChange;
    const tree = OrdinaryTagAllocationFields(props);
    const dates = descendants(tree).filter(item => item.type === 'button' && /真实.*日期/.test(item.props['aria-label'] || ''));
    expect(dates).toHaveLength(2);
    dates[0].props.onClick(); expect(props.onOpenDateDetails).toHaveBeenCalledOnce();
    expect(props.onInitialAmountChange).not.toHaveBeenCalled();
    const editable = fieldProps();
    const input = descendants(OrdinaryTagAllocationFields(editable)).find(item => item.type === 'input' && /真实暂停日期/.test(item.props['aria-label'] || ''))!;
    input.props.onChange({ target: { value: '2026-11-10' } });
    expect(editable.onPauseDateChange).toHaveBeenCalledWith('2026-11-10');
  });
  it("全体暂停锁定禁止日期改写和清除，但不锁独立观察日期", () => {
    const real = descendants(OrdinaryTagAllocationFields({ ...fieldProps(), pauseLocked: true }));
    const locked = real.find(item => item.type === 'button' && item.props['aria-label'] === '成员甲的真实暂停日期');
    expect(locked?.props.disabled).toBe(true);
    expect(real.some(item => item.props['aria-label'] === '清除成员甲的真实暂停日期')).toBe(false);
    const observing = descendants(OrdinaryTagAllocationFields({ ...fieldProps(), pauseLocked: true, observing: true }));
    expect(observing.some(item => item.type === 'input' && item.props['aria-label'] === '成员甲的观察暂停日期')).toBe(true);
  });
  it("金额、比例和±按钮仍转发三联动回调，不产生保存动作", () => {
    const props = fieldProps(); const all = descendants(OrdinaryTagAllocationFields(props));
    all.find(item => item.props['aria-label'] === '成员甲的真实初始金额')!.props.onChange({ target: { value: '0' } });
    expect(props.onInitialAmountChange).toHaveBeenCalledWith('0');
    all.find(item => item.props['aria-label'] === '成员甲的真实分配金额')!.props.onChange({ target: { value: '195190.38' } });
    expect(props.onTargetAmountChange).toHaveBeenCalledWith('195190.38');
    all.find(item => item.props['aria-label'] === '成员甲增加真实比例')!.props.onClick();
    expect(props.onRatioChange).toHaveBeenCalledWith('21');
    all.find(item => item.props['aria-label'] === '成员甲的真实比例')!.props.onChange({ target: { value: '-1' } });
    expect(props.onRatioChange).toHaveBeenCalledTimes(1);
  });
});

describe("头像与共享草稿安全接线", () => {
  it.each(['paused', 'running'] as const)("%s角标蓝/绿不跟头像灰度；批量使用原onDetails实时切visible", pauseStatus => {
    const props = { ...rowProps(), pauseStatus, visible: false, batchSelectMode: true };
    const tree = OrdinaryTagInlineMemberFields(props); const all = descendants(tree);
    const avatar = all.find(item => item.type === 'button' && item.props['aria-label'] === '显示成员甲的标签')!;
    avatar.props.onClick(); expect(props.onDetails).toHaveBeenCalledOnce();
    const badge = all.find(item => item.props['data-ordinary-pause-status'] === pauseStatus)!;
    expect(badge.props.style.backgroundColor).toBe(pauseStatus === 'paused' ? '#1976D2' : '#388E3C');
    expect(badge.props.style.filter).toBeUndefined();
    expect(renderToStaticMarkup(tree)).toContain('grayscale(100%)');
    expect(page).toContain('visible={batchSelectMode ? editState[member.userId]?.[cat.name]?.visible ?? visible : visible}');
    expect(page).toContain('pauseStatus={pauseStatus} remainingRatio={100 - total} batchSelectMode={batchSelectMode}');
  });
  it("仅37号普通标签三处共享新字段/草稿/保存，其他账本原日期与金额表单不重复进入37", () => {
    expect(page).toContain('ledgerId === 37 && !isStockTag && renderOrdinaryTagEditor(userId, cat, member)');
    expect(page).toContain('ledgerId === 37 && !isStockTag && category && renderOrdinaryTagEditor(userId, category, member)');
    expect(page).toContain('if (ledgerId !== 37 || isStockPortfolioTag(category)) return null;');
    expect(page).toContain('const renderOrdinaryTagSaveControls = (category: any) => ledgerId === 37 && !isStockPortfolioTag(category) && <div');
    expect(page).toContain('ledgerId === 37 && !isStockTag && <div className="flex flex-wrap items-center justify-end gap-2 pt-1">');
    expect(page.match(/ledgerId !== 37 && !isStockTag &&/g)).toHaveLength(2);
    expect(page.match(/ledgerId === 37 \? <div className="text-xs font-medium text-gray-700">暂停[^<]*<\/div> : <>/g)).toHaveLength(2);
    expect(page.match(/>日期设置<\/div>/g)).toHaveLength(2);
    expect(page.match(/>金额与比例<\/div>/g)).toHaveLength(2);
    expect(page).not.toContain('<OrdinaryTagAllocationFields');
    for (const tag of ['cat.name', 'tagName']) {
      for (const field of ['amount', 'ratio', 'targetAmount']) expect(page).toContain(`updateAllocationLink(userId, ${tag}, '${field}', e.target.value)`);
    }
    expect(page).not.toContain('<OrdinaryTagObservationEditor');
    expect(page).toContain('onActualEdit={(field, value) => editOrdinaryActual');
    expect(page).toContain('updateAllocationLink(userId, category.name, field, value');
    expect(page).toContain('renderOrdinaryTagSaveControls(category)');
    expect(page).toContain('取消本标签草稿'); expect(page).toContain('保存本标签金额/观察');
  });
  it("标签保存只走原helper：独立mutation不清成员日期/押金草稿，取消/失败返回false且弹窗不关闭", () => {
    expect(page).toContain('saveActual: input => ordinaryActualMutation.mutateAsync(input)');
    expect(page).toContain('const ordinaryActualMutation = trpc.ledger.adminSetMemberInitialBalances.useMutation();');
    expect(page).toContain('dirtyMemberDraftsRef.current.has(member.userId)');
    expect(page).toContain('if (!await handleSaveOrdinaryTag(category)) return false;');
    expect(page).toContain('if (ledgerId !== 37) {\n                      handleSaveMember(userId);\n                      setTagEditModal(null);');
    expect(page).toContain('disabled={isSaving || (ledgerId === 37 && (ordinarySavingTags.has(Number(category?.id)) || (isLocalHotPreview && !isStockTag)))}');
    expect(page).toContain('if (await handleSaveMember(userId)) setTagEditModal(null);');
    const save = page.slice(page.indexOf('const handleSaveOrdinaryTag'), page.indexOf('const allocationValueChanged'));
    expect(save).toContain('return saved;'); expect(save).toContain('return false;');
    expect(save).toContain('isDev: isLocalHotPreview'); expect(save).toContain('window.sessionStorage.setItem');
    expect(save).not.toContain('__pauseDate'); expect(save).not.toContain('settlePausedTagMutation');
  });
  it("真实暂停仍经过资金处理确认/历史锁定，押金编辑器、真实保存再结算/解冻顺序不变", () => {
    expect(page.match(/>确认暂停方案<\/button>/g)).toHaveLength(2);
    for (const token of ['标签全体暂停', "if (latestIsGlobalPause) return;", "disabled={item.pauseSource === 'tag_global'}", 'materializeMemberPausePlans(userId', 'MarginEntriesEditor({ userId, tagName', "action: 'retain'", '暂停/重启历史详情', '保存日期与押金']) expect(page).toContain(token);
    const save = page.slice(page.indexOf('const handleSaveMember'), page.indexOf('const renderOrdinaryTagSaveControls'));
    expect(save.indexOf('await setMutation.mutateAsync')).toBeLessThan(save.indexOf('await settlePausedTagMutation.mutateAsync'));
    expect(save.indexOf('await setMutation.mutateAsync')).toBeLessThan(save.indexOf('await releasePausedTagMarginsMutation.mutateAsync'));
    const fields = readFileSync(new URL('./OrdinaryTagAllocationFields.tsx', import.meta.url), 'utf8');
    for (const forbidden of ['trpc', 'mutateAsync', 'sessionStorage', 'localStorage', 'fetch(', 'setPauseWallet', 'settlePausedTag']) expect(fields).not.toContain(forbidden);
  });
});
