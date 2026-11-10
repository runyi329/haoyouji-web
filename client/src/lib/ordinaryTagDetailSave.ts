import {
  inlineConfigFromDraft, zeroOrdinaryActual, validateInlineActual,
  type OrdinaryActualAllocation, type OrdinaryInlineObservationDraft,
} from "@/components/ordinaryTagInlineAllocation";
import type { OrdinaryTagObservationConfig } from "@shared/ordinary-tag-observation";
import { clearedOrdinaryConfig, validateOrdinaryClearRequest, validateOrdinaryClearResult, type OrdinaryClearRequest, type OrdinaryClearTarget } from './ordinaryTagMemberClear';

export type DetailPause = { pauseDate: string; resumeDate?: string; pauseSource?: string; pauseSettlement?: unknown };
export type DetailMargin = { id: string; coin: string; amount: string; notes: Array<{ id: string; content: string; createdAt: string }>; releasedAmount?: string; remainingAmount?: string };
export type DetailEntry = OrdinaryActualAllocation & {
  startDate: string; pauseDate: string; endDate: string; visible: boolean;
  pauseHistory: DetailPause[]; margins: DetailMargin[]; legacyMarginNoteIds: number[];
};
export type DetailPausePlan = { userId: number; tagName: string; pauseDate: string; action: "retain" | "release_wallet_holds" | "settle_and_release" };
export type DetailSnapshot = { entry: DetailEntry; observation: OrdinaryInlineObservationDraft; plan?: DetailPausePlan | null; pendingPlan?: DetailPausePlan | null; pendingClear?: OrdinaryClearTarget | null };

const numeric = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text !== "" && Number.isFinite(Number(text)) ? String(Number(text)) : text;
};
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
export const detailValuesEqual = (a: unknown, b: unknown) => stable(a) === stable(b);
const coinOf = (coin: string) => !coin || ["人民币", "RMB", "元"].includes(coin.toUpperCase()) ? "CNY" : coin.toUpperCase();
const marginsForCompare = (margins: DetailMargin[]) => margins.map(item => ({ ...item, coin: coinOf(item.coin), amount: numeric(item.amount),
  releasedAmount: item.releasedAmount === undefined ? undefined : numeric(item.releasedAmount), remainingAmount: item.remainingAmount === undefined ? undefined : numeric(item.remainingAmount),
  notes: item.notes.map(note => ({ ...note, content: note.content.trim() })),
}));
export function detailObservationEqual(a: OrdinaryInlineObservationDraft, b: OrdinaryInlineObservationDraft) {
  // An unsaved on/off round-trip can leave seeded references behind; absent disabled config has no persisted observation settings.
  if (!a.enabled && !b.enabled && !b.startDate && !b.initialAmount && !b.ratio) return true;
  return a.enabled === b.enabled && numeric(a.initialAmount) === numeric(b.initialAmount) && numeric(a.ratio) === numeric(b.ratio)
    && a.startDate === b.startDate && a.pauseDate === b.pauseDate;
}
export function detailActualEqual(a: OrdinaryActualAllocation, b: OrdinaryActualAllocation) {
  // Empty historical triplets have a zero display fallback, not a real edit.
  return ["amount", "ratio", "targetAmount"].every(key => numeric(a[key as keyof OrdinaryActualAllocation]) === numeric(b[key as keyof OrdinaryActualAllocation])
    || (key !== "amount" && ["", "0"].includes(numeric(a[key as keyof OrdinaryActualAllocation])) && ["", "0"].includes(numeric(b[key as keyof OrdinaryActualAllocation]))));
}
export function materializeDetailPause(entry: DetailEntry, plan?: DetailPausePlan | null): DetailEntry {
  if (!plan?.pauseDate) return entry;
  const history = entry.pauseHistory;
  const last = history[history.length - 1];
  return { ...entry, pauseDate: "", pauseHistory: last && !last.resumeDate
    ? history.map((item, index) => index === history.length - 1 ? { ...item, pauseDate: plan.pauseDate } : item)
    : [...history, { pauseDate: plan.pauseDate }] };
}
const effectivePlan = (snapshot: DetailSnapshot) => snapshot.pendingPlan ?? snapshot.plan;
export function ordinaryDetailIsChanged(current: DetailSnapshot, saved: DetailSnapshot) {
  return Boolean(current.pendingClear) || !detailActualEqual(current.entry, saved.entry) || !detailObservationEqual(current.observation, saved.observation)
    || ["startDate", "endDate", "visible"].some(key => !detailValuesEqual(current.entry[key as keyof DetailEntry], saved.entry[key as keyof DetailEntry]))
    || !detailValuesEqual(current.entry.pauseHistory, saved.entry.pauseHistory) || current.entry.pauseDate !== saved.entry.pauseDate
    || !detailValuesEqual(marginsForCompare(current.entry.margins), marginsForCompare(saved.entry.margins))
    || !detailValuesEqual(effectivePlan(current) ?? null, effectivePlan(saved) ?? null);
}
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const checkDate = (value: string, label: string) => { if (value && !validDate(value)) throw new Error(`${label}必须是有效日期`); };
export type DetailSaveRequest = { ledgerId: number; targetUserId: number; scopedOrdinaryCategoryId: number; balances: Record<string, number | string>; migratedMarginNoteIds: number[] };
export type DetailSavePlan = {
  target: { ledgerId: number; targetUserId: number; categoryId: number; tagName: string };
  observationRequest: { ledgerId: number; targetUserId: number; categoryId: number; config: OrdinaryTagObservationConfig } | null;
  clearRequest?: OrdinaryClearRequest | null;
  configRequest: DetailSaveRequest | null; entry: DetailEntry; observation: OrdinaryInlineObservationDraft; walletPlan: DetailPausePlan | null;
};
/** All changed inputs are checked before the first request. Only this user/tag's changed keys are emitted. */
export function buildOrdinaryDetailSavePlan(input: {
  target: DetailSavePlan["target"]; current: DetailSnapshot; saved: DetailSnapshot;
  clearRequest?: OrdinaryClearRequest | null;
}): DetailSavePlan {
  const { target, current } = input;
  let saved = input.saved;
  if (target.ledgerId !== 37 || !Number.isSafeInteger(target.targetUserId) || target.targetUserId <= 0 || !Number.isSafeInteger(target.categoryId) || target.categoryId <= 0 || !target.tagName) throw new Error("保存目标无效");
  const clearRequest = input.clearRequest ?? null;
  if (current.pendingClear || clearRequest) {
    const pending = current.pendingClear;
    if (!pending || pending.ledgerId !== target.ledgerId || pending.targetUserId !== target.targetUserId || pending.categoryId !== target.categoryId || pending.tagName !== target.tagName
      || current.observation.enabled || saved.observation.enabled || !detailObservationEqual(current.observation, saved.observation)
      || current.entry.startDate !== '' || !['amount', 'ratio', 'targetAmount'].every(key => numeric(current.entry[key as keyof DetailEntry]) === '0')) {
      throw new Error('待清空已失效：目标、四字段或观察已修改，请重新确认清空');
    }
    if (!clearRequest) throw new Error('待清空须在底部保存前重新读取并验证影响');
    validateOrdinaryClearRequest(target, clearRequest);
    // Only these four comparison fields are acknowledged in advance for planning; no saved state is mutated here.
    saved = { ...saved, entry: { ...saved.entry, ...clearedOrdinaryConfig() } };
  }
  const walletPlan = effectivePlan(current) ?? null;
  if (walletPlan && (walletPlan.userId !== target.targetUserId || walletPlan.tagName !== target.tagName || !validDate(walletPlan.pauseDate)
    || !["retain", "release_wallet_holds", "settle_and_release"].includes(walletPlan.action))) throw new Error("暂停方案或日期无效");
  const observationChanged = !detailObservationEqual(current.observation, saved.observation);
  const observationRequest = observationChanged || (current.observation.enabled && Number(saved.entry.ratio) > 0)
    ? { ledgerId: 37, targetUserId: target.targetUserId, categoryId: target.categoryId, config: inlineConfigFromDraft(current.observation) } : null;
  const savedActual = { amount: saved.entry.amount, ratio: saved.entry.ratio, targetAmount: saved.entry.targetAmount };
  const entry = materializeDetailPause({ ...current.entry, ...(current.observation.enabled ? zeroOrdinaryActual(savedActual) : {}) }, walletPlan);
  const balances: Record<string, number | string> = {};
  const n = target.tagName;
  const wasConfigured = Boolean(saved.entry.startDate) || [saved.entry.amount, saved.entry.ratio, saved.entry.targetAmount].some(value => Number(value || 0) > 0);
  const fullyEmpty = !entry.startDate && [entry.amount, entry.ratio, entry.targetAmount].every(value => Number(value || 0) === 0);
  if (wasConfigured && fullyEmpty) throw new Error('完整清空须点击“清空”，先核对受影响天数再确认');
  const lastPause = entry.pauseHistory[entry.pauseHistory.length - 1];
  if (walletPlan && (!lastPause || lastPause.resumeDate || lastPause.pauseDate !== walletPlan.pauseDate || lastPause.pauseSource === 'tag_global')) throw new Error('暂停资金方案须对应当前个人暂停状态');
  const actualChanged = !current.observation.enabled && !detailActualEqual(entry, saved.entry);
  if (actualChanged) {
    validateInlineActual(entry);
    balances[n] = Number(entry.amount); balances[`${n}__ratio`] = Number(entry.ratio); balances[`${n}__targetAmount`] = Number(entry.targetAmount);
  }
  for (const key of ["startDate", "endDate"] as const) if (entry[key] !== saved.entry[key]) {
    checkDate(entry[key], key === "startDate" ? "实际开始日期" : "结束日期"); balances[`${n}__${key}`] = entry[key];
  }
  if (entry.startDate && entry.endDate && entry.endDate < entry.startDate) throw new Error("结束日期不能早于实际开始日期");
  if (!detailValuesEqual(entry.pauseHistory, saved.entry.pauseHistory) || entry.pauseDate !== saved.entry.pauseDate) {
    checkDate(entry.pauseDate, "暂停日期");
    let previousResume = "";
    for (const item of entry.pauseHistory) {
      if (!validDate(item.pauseDate)) throw new Error("暂停历史中请填写有效暂停日期，或删除该记录");
      checkDate(item.resumeDate || "", "重启日期");
      if ((entry.startDate && item.pauseDate < entry.startDate) || (previousResume && item.pauseDate < previousResume) || (item.resumeDate && item.resumeDate < item.pauseDate)) throw new Error("暂停/重启日期顺序无效");
      previousResume = item.resumeDate || item.pauseDate;
    }
    const protectedHistory = saved.entry.pauseHistory.filter(item => item.pauseSource === "tag_global" || item.pauseSettlement);
    for (const item of protectedHistory) if (!entry.pauseHistory.some(next => detailValuesEqual(item, next))) throw new Error("全体暂停或已结算历史不可修改或删除");
    const last = entry.pauseHistory[entry.pauseHistory.length - 1];
    balances[`${n}__pauseHistory`] = JSON.stringify(entry.pauseHistory);
    balances[`${n}__pauseDate`] = last ? last.resumeDate ? "" : last.pauseDate : entry.pauseDate;
  }
  let migratedMarginNoteIds: number[] = [];
  if (!detailValuesEqual(marginsForCompare(entry.margins), marginsForCompare(saved.entry.margins))) {
    const margins = entry.margins.map(item => {
      if (!item.id || !String(item.amount).trim() || !Number.isFinite(Number(item.amount))) throw new Error("押金明细金额未填写完整或无效");
      if (!coinOf(item.coin)) throw new Error("押金币种无效");
      return { ...item, coin: coinOf(item.coin), amount: Number(item.amount), notes: item.notes.filter(note => note.content.trim()).map(note => ({ ...note, content: note.content.trim() })) };
    });
    balances[`${n}__margins`] = JSON.stringify(margins);
    balances[`${n}__margin`] = margins[0]?.amount ?? 0; balances[`${n}__marginCoin`] = margins[0]?.coin ?? "";
    // Scoped detail saves never delete shared historical notes.
  }
  // Visibility continues to use its existing independently confirmed immediate-save path.
  const configRequest = Object.keys(balances).length ? { ledgerId: 37, targetUserId: target.targetUserId, scopedOrdinaryCategoryId: target.categoryId, balances, migratedMarginNoteIds } : null;
  return { target, observationRequest, clearRequest, configRequest, entry, observation: current.observation, walletPlan };
}
export type DetailSaveDependencies = {
  inFlight: Set<string>; confirm: (message: string) => boolean;
  saveClear?: (input: OrdinaryClearRequest) => Promise<unknown>;
  onClearSaved?: (plan: DetailSavePlan) => void | Promise<void>;
  saveObservation: (input: NonNullable<DetailSavePlan["observationRequest"]>) => Promise<unknown>;
  saveConfig: (input: DetailSaveRequest) => Promise<unknown>;
  saveWalletPlan: (plan: DetailPausePlan) => Promise<unknown>;
  onObservationSaved: (plan: DetailSavePlan) => void | Promise<void>;
  onConfigSaved: (plan: DetailSavePlan) => void | Promise<void>;
  onWalletSaved: (plan: DetailSavePlan) => void | Promise<void>;
};
/** Sequential, not atomic: acknowledge each successful segment immediately; retry never repeats acknowledged wallet work. */
export async function saveOrdinaryDetail(plan: DetailSavePlan, deps: DetailSaveDependencies): Promise<boolean> {
  const scope = `${plan.target.ledgerId}:${plan.target.targetUserId}:${plan.target.categoryId}`;
  if (deps.inFlight.has(scope)) return false;
  deps.inFlight.add(scope);
  let completed = 0;
  try {
    // Missing capability or forged/mismatched request must fail before ANY segment can write.
    if (plan.clearRequest) {
      validateOrdinaryClearRequest(plan.target, plan.clearRequest);
      if (!deps.saveClear || !deps.onClearSaved) throw new Error('专用清空保存能力不可用');
    }
    if (plan.observationRequest?.config.enabled && !deps.confirm(`确认将「${plan.target.tagName}」该成员切换为观察？真实比例/权益归零，历史、押金和钱包不动；关闭观察不会自动恢复份额。`)) return false;
    if (plan.walletPlan && plan.walletPlan.action !== 'retain' && !deps.confirm(`确认保存「${plan.target.tagName}」该成员 ${plan.walletPlan.pauseDate} 的暂停，并${plan.walletPlan.action === 'settle_and_release' ? '解冻本标签保证金及按差额结算分红/钱包回填' : '解冻本标签仍冻结的保证金退回成员钱包'}？仅执行已选择的方案；配置与资金为顺序请求，失败时会保留未完成部分。`)) return false;
    if (plan.clearRequest) { const result = await deps.saveClear!(plan.clearRequest); validateOrdinaryClearResult(plan.target, result); completed++; await deps.onClearSaved!(plan); }
    if (plan.observationRequest) { await deps.saveObservation(plan.observationRequest); completed++; await deps.onObservationSaved(plan); }
    if (plan.configRequest) { await deps.saveConfig(plan.configRequest); completed++; await deps.onConfigSaved(plan); }
    if (plan.walletPlan) { if (plan.walletPlan.action !== "retain") await deps.saveWalletPlan(plan.walletPlan); completed++; await deps.onWalletSaved(plan); }
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${completed ? "部分已保存；" : "保存未完成；"}${reason}。未成功的修改/暂停方案已保留，请重试（已成功段不重复执行）`);
  } finally { deps.inFlight.delete(scope); }
}
