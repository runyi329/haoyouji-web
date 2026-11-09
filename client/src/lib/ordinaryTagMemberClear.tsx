import type { ReactElement } from "react";

export type OrdinaryClearTarget = {
  ledgerId: number;
  targetUserId: number;
  categoryId: number;
  tagName: string;
  memberName: string;
};
export type OrdinaryClearImpact = {
  ledgerId: 37;
  userId: number;
  categoryId: number;
  categoryName: string;
  affectedDays: number;
  firstDate: string | null;
  lastDate: string | null;
  impactHash: string;
  hasConfiguredStartDate: boolean;
};
export type OrdinaryClearEligibility = {
  ledgerId: number;
  canAccess: boolean;
  category?: { id: number | string; name: string; accountingMode?: string; accounting_mode?: string } | null;
  savedObservationEnabled: boolean;
  observationDraftEnabled?: boolean;
};
export const ordinaryClearScope = (target: OrdinaryClearTarget) => `${target.ledgerId}:${target.targetUserId}:${target.categoryId}`;
export const clearedOrdinaryConfig = () => ({ amount: "0", ratio: "0", targetAmount: "0", startDate: "" });
export function ordinaryClearEligibility(input: OrdinaryClearEligibility): { visible: boolean; observationBlocked: boolean } {
  const category = input.category;
  return {
    visible: input.ledgerId === 37 && input.canAccess && !!category && Number.isSafeInteger(Number(category.id)) && Number(category.id) > 0
      && category.name.length > 0 && category.accountingMode !== "stock_portfolio" && category.accounting_mode !== "stock_portfolio",
    observationBlocked: input.savedObservationEnabled || input.observationDraftEnabled === true
      || (input.observationDraftEnabled !== undefined && input.observationDraftEnabled !== input.savedObservationEnabled),
  };
}
function validateTarget(target: OrdinaryClearTarget): void {
  if (target.ledgerId !== 37 || !Number.isSafeInteger(target.targetUserId) || target.targetUserId <= 0
    || !Number.isSafeInteger(target.categoryId) || target.categoryId <= 0 || !target.tagName || !target.memberName.trim()) {
    throw new Error("清空目标无效：仅支持 37 号账本有效普通标签成员");
  }
}
const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
/** 只接受本次查询返回的精确用户/分类；未知、失败或异常计数不能按零天处理。 */
export function validateOrdinaryClearImpact(target: OrdinaryClearTarget, raw: unknown): OrdinaryClearImpact {
  validateTarget(target);
  const impact = raw as OrdinaryClearImpact | null;
  if (!impact || impact.ledgerId !== 37 || impact.userId !== target.targetUserId || impact.categoryId !== target.categoryId
    || impact.categoryName !== target.tagName || !Number.isSafeInteger(impact.affectedDays) || impact.affectedDays < 0
    || typeof impact.impactHash !== "string" || !/^[a-f0-9]{64}$/i.test(impact.impactHash)
    || typeof impact.hasConfiguredStartDate !== "boolean"
    || (impact.affectedDays === 0 ? impact.firstDate !== null || impact.lastDate !== null
      : !validDate(impact.firstDate) || !validDate(impact.lastDate) || impact.firstDate > impact.lastDate)) {
    throw new Error("影响预检无效或与当前用户、标签不匹配，请重新预检后再操作");
  }
  return impact;
}
/** 专用接口仅接收目标及影响快照，不带任何可见性、观察、资金或其它标签配置。 */
declare const validatedClearRequest: unique symbol;
export type OrdinaryClearRequest = { ledgerId: 37; targetUserId: number; categoryId: number; impactHash: string; readonly [validatedClearRequest]: true };
const validatedRequests = new WeakSet<object>();
export function ordinaryClearRequest(target: OrdinaryClearTarget, rawImpact: unknown): OrdinaryClearRequest {
  const impact = validateOrdinaryClearImpact(target, rawImpact);
  const request = { ledgerId: 37 as const, targetUserId: target.targetUserId, categoryId: target.categoryId, impactHash: impact.impactHash } as OrdinaryClearRequest;
  validatedRequests.add(request);
  return request;
}
export function validateOrdinaryClearRequest(target: Pick<OrdinaryClearTarget, 'ledgerId' | 'targetUserId' | 'categoryId'>, request: OrdinaryClearRequest): void {
  if (!validatedRequests.has(request) || request.ledgerId !== target.ledgerId || request.targetUserId !== target.targetUserId
    || request.categoryId !== target.categoryId || !/^[a-f0-9]{64}$/i.test(request.impactHash) || Object.keys(request).sort().join(',') !== 'categoryId,impactHash,ledgerId,targetUserId') {
    throw new Error('清空请求未经有效预检或与当前保存目标不匹配');
  }
}
/** 用于成功后精确合并 query cache，四键固定，绝不扩展目标范围。 */
export function ordinaryClearedBalanceKeys(tagName: string): Record<string, number | string> {
  return { [tagName]: 0, [`${tagName}__ratio`]: 0, [`${tagName}__targetAmount`]: 0, [`${tagName}__startDate`]: "" };
}
export function validateOrdinaryClearResult(target: Pick<OrdinaryClearTarget, 'ledgerId' | 'targetUserId' | 'categoryId'>, raw: unknown): void {
  const result = raw as { success?: unknown; ledgerId?: unknown; userId?: unknown; categoryId?: unknown; cleared?: Record<string, unknown> } | null;
  if (!result || result.success !== true || result.ledgerId !== 37 || target.ledgerId !== 37 || result.userId !== target.targetUserId || result.categoryId !== target.categoryId
    || !result.cleared || !['amount', 'ratio', 'targetAmount'].every(key => result.cleared![key] === 0 || result.cleared![key] === '0') || result.cleared.startDate !== '') {
    throw new Error('专用清空成功回执无效或目标不匹配，未确认保存，请重新核对');
  }
}
export function ordinaryClearConfirmation(target: OrdinaryClearTarget, impact: OrdinaryClearImpact, hasUnsavedTargetChanges: boolean, isDev: boolean): string {
  validateOrdinaryClearImpact(target, impact);
  return [
    `确认清空「${target.tagName}」中「${target.memberName}」的配置？`,
    impact.affectedDays > 0 ? `将清除该用户 ${impact.affectedDays} 天的收益显示（${impact.firstDate} 至 ${impact.lastDate}，仅统计有登记数据的日期）。` : "尚无对应收益登记：0 天（没有受影响的收益登记数据）。",
    "初始金额、分配比例及权益归零，开始日期清除；清除当前配置及由该配置推算的个人收益显示。",
    "显示/隐藏保持原样；不删除标签原始收益记录、历史钱包流水，不改暂停历史、押金、钱包或其他用户、其他标签。",
    hasUnsavedTargetChanges ? "本次该用户该标签未保存的金额、比例、权益及开始日期修改将一并丢弃；暂停及押金等其他未保存的修改保留。" : "",
    "确认后仅暂存为待清空，不立即提交；待点击详情底部“保存”后生效，届时重新核对影响并清空真实配置。",
    isDev ? "当前开发预览只读，不会清空真实数据。" : "",
  ].filter(Boolean).join("\n");
}
export function ordinaryClearSaveConfirmation(target: OrdinaryClearTarget, impact: OrdinaryClearImpact): string {
  validateOrdinaryClearImpact(target, impact);
  return [`底部保存前重新核对：确认现在清空「${target.tagName}」中「${target.memberName}」的真实配置？`,
    impact.affectedDays ? `最新受影响收益登记：${impact.affectedDays} 天（${impact.firstDate} 至 ${impact.lastDate}）。` : '最新受影响收益登记：0 天。',
    '仅金额、比例、权益归零及开始日期清除；暂停、押金、显示/隐藏、钱包和其他用户/标签不因清空改变。',
    '随后保存当前成员本标签的其余合法修改；取消则不提交任何修改。'].join('\n');
}
export function patchOrdinaryClearedEntry<T extends { amount: string; ratio: string; targetAmount: string; startDate: string }>(
  previous: Record<number, Record<string, T>>, target: OrdinaryClearTarget, fallback: T,
): Record<number, Record<string, T>> {
  return { ...previous, [target.targetUserId]: { ...previous[target.targetUserId],
    [target.tagName]: { ...(previous[target.targetUserId]?.[target.tagName] ?? fallback), ...clearedOrdinaryConfig() } } };
}
export function patchOrdinaryClearScope<T>(previous: Record<string, T>, target: OrdinaryClearTarget, value?: T): Record<string, T> {
  const next = { ...previous };
  if (value === undefined) delete next[ordinaryClearScope(target)];
  else next[ordinaryClearScope(target)] = value;
  return next;
}
export function patchOrdinaryClearedCache<T extends { balancesMap?: Record<number, Record<string, unknown>> }>(previous: T | undefined, target: OrdinaryClearTarget): T | undefined {
  if (!previous) return previous;
  return { ...previous, balancesMap: { ...previous.balancesMap,
    [target.targetUserId]: { ...previous.balancesMap?.[target.targetUserId], ...ordinaryClearedBalanceKeys(target.tagName) } } };
}
export type OrdinaryClearDependencies = {
  isDev: boolean;
  inFlight: Set<string>;
  confirm: (message: string) => boolean;
  onStaged: (target: OrdinaryClearTarget) => void | Promise<void>;
  onBusy?: (scope: string, busy: boolean) => void;
};
/** 仅预检和确认草稿；这里没有任何写入依赖，保存基线和缓存只能在底部专用清空成功后确认。 */
export async function clearOrdinaryTagMember(
  input: { target: OrdinaryClearTarget; eligibility: OrdinaryClearEligibility; impact: unknown; hasUnsavedTargetChanges: boolean },
  deps: OrdinaryClearDependencies,
): Promise<boolean> {
  const gate = ordinaryClearEligibility(input.eligibility);
  if (!gate.visible || gate.observationBlocked || Number(input.eligibility.category?.id) !== input.target.categoryId
    || input.eligibility.category?.name !== input.target.tagName || input.eligibility.ledgerId !== input.target.ledgerId) {
    throw new Error("当前不可清空；观察已开启或切换未保存时，请先关闭观察并保存");
  }
  const impact = validateOrdinaryClearImpact(input.target, input.impact);
  const scope = ordinaryClearScope(input.target);
  if (deps.inFlight.has(scope)) return false;
  deps.inFlight.add(scope);
  deps.onBusy?.(scope, true);
  try {
    if (!deps.confirm(ordinaryClearConfirmation(input.target, impact, input.hasUnsavedTargetChanges, deps.isDev))) return false;
    await deps.onStaged(input.target);
    return true;
  } finally {
    deps.inFlight.delete(scope);
    deps.onBusy?.(scope, false);
  }
}
export type OrdinaryTagMemberClearSectionProps = {
  target: OrdinaryClearTarget;
  eligibility: OrdinaryClearEligibility;
  impact: unknown;
  loading: boolean;
  error?: string;
  saving: boolean;
  conflictingSave: boolean;
  isDev: boolean;
  onClear: () => void;
  onRetry: () => void;
};
/** 仅目标详情使用的独立小节；不与头像显示/隐藏、日期或押金保存耦合。 */
export function OrdinaryTagMemberClearSection(props: OrdinaryTagMemberClearSectionProps): ReactElement | null {
  const gate = ordinaryClearEligibility(props.eligibility);
  if (!gate.visible) return null;
  // 点击后由父层读取新鲜预检，再由严格 helper 验证与确认；未知数据绝不当作零天。
  const disabled = props.loading || props.saving || props.conflictingSave;
  return <section data-ordinary-member-clear={props.target.categoryId} className="flex items-center justify-end">
    <button type="button" aria-label="清空当前用户本标签配置" aria-busy={props.loading || props.saving} disabled={disabled} onClick={props.onClear} className="h-7 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40">清空</button>
  </section>;
}
