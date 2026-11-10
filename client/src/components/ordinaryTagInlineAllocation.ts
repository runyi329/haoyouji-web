import {
  validateOrdinaryTagObservationConfig,
  type OrdinaryTagObservationConfig,
} from "@shared/ordinary-tag-observation";

export type OrdinaryInlineObservationDraft = {
  enabled: boolean;
  initialAmount: string;
  ratio: string;
  startDate: string;
  pauseDate: string;
};
export type OrdinaryActualAllocation = { amount: string; ratio: string; targetAmount: string };
export const ordinaryInlineScope = (ledgerId: number, userId: number, categoryId: number) => `${ledgerId}:${userId}:${categoryId}`;
export const ordinaryInlinePreviewKey = (userId: number, categoryId: number) => `ordinary-tag-observation-preview:${userId}:${categoryId}`;
export const ordinaryActualPreviewKey = (ledgerId: number, userId: number, categoryId: number) => `ordinary-tag-actual-preview:${ledgerId}:${userId}:${categoryId}`;
export const emptyInlineObservation = (): OrdinaryInlineObservationDraft => ({ enabled: false, initialAmount: "", ratio: "", startDate: "", pauseDate: "" });
export const inlineObservationFromConfig = (config: OrdinaryTagObservationConfig | null): OrdinaryInlineObservationDraft => config ? ({
  enabled: config.enabled, initialAmount: String(config.initialAmount), ratio: String(config.ratio), startDate: config.startDate, pauseDate: config.pauseDate || "",
}) : emptyInlineObservation();
export const inlineObservationsEqual = (a: OrdinaryInlineObservationDraft, b: OrdinaryInlineObservationDraft) =>
  a.enabled === b.enabled && a.initialAmount === b.initialAmount && a.ratio === b.ratio && a.startDate === b.startDate && a.pauseDate === b.pauseDate;

/** 只在管理员明确点击开启时调用；首次种子采用当前真实三联动参考值，不自动开启。 */
export function toggleInlineObservation(
  previous: OrdinaryInlineObservationDraft,
  enabled: boolean,
  actual: OrdinaryActualAllocation & { startDate: string },
  today: string,
): OrdinaryInlineObservationDraft {
  if (!enabled) return { ...previous, enabled: false };
  if (previous.startDate || previous.initialAmount || previous.ratio) return { ...previous, enabled: true };
  return { enabled: true, initialAmount: actual.amount, ratio: actual.ratio, startDate: actual.startDate || today, pauseDate: "" };
}

/** 保留小数，不按整数四舍五入；每次加减恰为一百分点，仅限制下限为 0。 */
export function stepInlineRatio(raw: string, direction: -1 | 1): string {
  const parsed = Number(raw);
  const next = Math.max(0, (Number.isFinite(parsed) ? parsed : 0) + direction);
  return String(Number(next.toFixed(10)));
}
export function parseInlineRatioInput(raw: string): string | null {
  const text = raw.replace(/%/g, "");
  if (!/^\d*\.?\d*$/.test(text)) return null;
  if (text === "" || text === ".") return text;
  return Number.isFinite(Number(text)) && Number(text) >= 0 ? text : null;
}
export function inlineConfigFromDraft(draft: OrdinaryInlineObservationDraft): OrdinaryTagObservationConfig {
  if (!draft.initialAmount.trim() || !draft.ratio.trim()) throw new Error("请填写参考初始金额和非负有限比例");
  return validateOrdinaryTagObservationConfig({ enabled: draft.enabled, initialAmount: Number(draft.initialAmount), ratio: Number(draft.ratio), startDate: draft.startDate, pauseDate: draft.pauseDate || null });
}
export function readInlineObservationPreview(storage: Pick<Storage, "getItem">, userId: number, categoryId: number): OrdinaryTagObservationConfig | null {
  try {
    const raw = storage.getItem(ordinaryInlinePreviewKey(userId, categoryId));
    return raw ? validateOrdinaryTagObservationConfig(JSON.parse(raw)) : null;
  } catch { return null; }
}
export function readOrdinaryActualPreview(storage: Pick<Storage, "getItem">, ledgerId: number, userId: number, categoryId: number): OrdinaryActualAllocation | null {
  try {
    const raw = storage.getItem(ordinaryActualPreviewKey(ledgerId, userId, categoryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !["amount", "ratio", "targetAmount"].every(key => typeof parsed[key] === "string")) return null;
    validateInlineActual(parsed);
    return { amount: parsed.amount, ratio: parsed.ratio, targetAmount: parsed.targetAmount };
  } catch { return null; }
}
export function zeroOrdinaryActual(actual: OrdinaryActualAllocation): OrdinaryActualAllocation {
  return { ...actual, ratio: "0", targetAmount: "0" };
}
export function validateInlineActual(actual: OrdinaryActualAllocation): OrdinaryActualAllocation {
  if ([actual.amount, actual.ratio, actual.targetAmount].some(value => value.trim() === "")) throw new Error("请填写完整的初始金额、比例和分配金额");
  const amount = Number(actual.amount), ratio = Number(actual.ratio), target = Number(actual.targetAmount);
  const zeroExit = amount === 0 && ratio === 0 && target === 0;
  if (!Number.isFinite(amount) || (!zeroExit && amount <= 0) || !Number.isFinite(ratio) || ratio < 0 || !Number.isFinite(target) || target < 0) throw new Error("需填写有限正数初始金额及非负有限比例和分配金额，或三项均为 0 退出");
  const product = amount * ratio;
  const expected = product / 100;
  const difference = target - expected;
  if (!Number.isFinite(product) || !Number.isFinite(expected) || !Number.isFinite(difference)) throw new Error("分配金额计算溢出，请调整初始金额或比例");
  if (Math.abs(difference) > 0.01) throw new Error("分配金额须等于初始金额 × 比例");
  return actual;
}
export function summarizeOrdinaryInlineRows(rows: ReadonlyArray<{ enabled: boolean; actual: OrdinaryActualAllocation; observationRatio: string }>) {
  return rows.reduce((sum, row) => {
    if (row.enabled) {
      sum.observerCount++;
      sum.observationRatio += Number(row.observationRatio) || 0;
    } else {
      const ratio = Number(row.actual.ratio) || 0;
      sum.actualRatio += ratio;
      sum.actualAmount += (Number(row.actual.amount) || 0) * ratio / 100;
      if (ratio > 0) sum.actualCount++;
    }
    return sum;
  }, { actualRatio: 0, actualAmount: 0, actualCount: 0, observationRatio: 0, observerCount: 0 });
}

export type OrdinaryInlineSaveRow = {
  userId: number;
  name: string;
  observation: OrdinaryInlineObservationDraft;
  observationChanged: boolean;
  actual: OrdinaryActualAllocation;
  actualChanged: boolean;
  previousActual?: OrdinaryActualAllocation;
  /** 已保存真实份额；不能以开关后的零显示值代替，用于转换前确认。 */
  previousActualRatio: number;
};
export type OrdinaryInlineSaveDependencies = {
  isDev: boolean;
  storage: Pick<Storage, "setItem">;
  confirm: (message: string) => boolean;
  dispatchPreviewChange: (detail: { userId: number; categoryId: number }) => void;
  saveObservation: (input: { ledgerId: number; categoryId: number; targetUserId: number; config: OrdinaryTagObservationConfig }) => Promise<unknown>;
  saveActual: (input: { ledgerId: number; targetUserId: number; balances: Record<string, number>; migratedMarginNoteIds: number[] }) => Promise<unknown>;
  /** 每个成功的转换即记录已释放状态，后续失败重试也不能写回旧真实草稿。 */
  onObservationSaved: (row: OrdinaryInlineSaveRow, config: OrdinaryTagObservationConfig) => void;
  onActualSaved: (row: OrdinaryInlineSaveRow) => void;
};

/** 整个标签预校验；所有观察先于任何真实写入，真实减配先于增配。失败抛出并保留未成功行的草稿。 */
export async function saveOrdinaryInlineTag(
  input: { ledgerId: number; categoryId: number; tagName: string; rows: readonly OrdinaryInlineSaveRow[] },
  deps: OrdinaryInlineSaveDependencies,
): Promise<boolean> {
  if (input.ledgerId !== 37 || !Number.isSafeInteger(input.categoryId) || input.categoryId <= 0 || !input.tagName
    || input.rows.some(row => !Number.isSafeInteger(row.userId) || row.userId <= 0)) throw new Error("仅支持 37 号账本有效普通标签成员");
  const observations = input.rows.filter(row => row.observationChanged || (row.observation.enabled && row.previousActualRatio > 0))
    .map(row => ({ row, config: inlineConfigFromDraft(row.observation) }));
  // 观察开启的行不生成真实载荷，哪怕之前已有真实草稿。
  const actuals = input.rows.filter(row => !row.observation.enabled && row.actualChanged);
  for (const row of actuals) validateInlineActual(row.actual);
  const releases = observations.filter(({ row, config }) => config.enabled && row.previousActualRatio > 0);
  if (releases.length > 0 && !deps.confirm([
    `确认将「${input.tagName}」以下成员切换为观察？`,
    ...releases.map(({ row }) => `${row.name}：释放真实配置 ${row.previousActualRatio}%`),
    "仅释放当前真实配置份额（比例及分配金额归零），历史、押金和钱包不动。",
    "观察不计入真实分配、不参与结算。关闭观察不会自动恢复实际份额，需重新分配真实比例。",
    deps.isDev ? "本次仅存当前浏览器会话预览，不会提交正式账本。" : "",
  ].filter(Boolean).join("\n"))) return false;
  for (const { row, config } of observations) {
    if (deps.isDev) {
      deps.storage.setItem(ordinaryInlinePreviewKey(row.userId, input.categoryId), JSON.stringify(config));
      if (config.enabled) deps.storage.setItem(ordinaryActualPreviewKey(input.ledgerId, row.userId, input.categoryId), JSON.stringify(zeroOrdinaryActual(row.previousActual ?? row.actual)));
    } else {
      await deps.saveObservation({ ledgerId: input.ledgerId, categoryId: input.categoryId, targetUserId: row.userId, config });
    }
    deps.onObservationSaved(row, config);
    if (deps.isDev) deps.dispatchPreviewChange({ userId: row.userId, categoryId: input.categoryId });
  }
  for (const row of [...actuals].sort((a, b) => (Number(a.actual.ratio) - a.previousActualRatio) - (Number(b.actual.ratio) - b.previousActualRatio))) {
    if (deps.isDev) {
      deps.storage.setItem(ordinaryActualPreviewKey(input.ledgerId, row.userId, input.categoryId), JSON.stringify(row.actual));
    } else {
      await deps.saveActual({ ledgerId: input.ledgerId, targetUserId: row.userId, balances: {
        [input.tagName]: Number(row.actual.amount), [`${input.tagName}__ratio`]: Number(row.actual.ratio), [`${input.tagName}__targetAmount`]: Number(row.actual.targetAmount),
      }, migratedMarginNoteIds: [] });
    }
    deps.onActualSaved(row);
  }
  return true;
}
