import { useEffect, useId, useReducer, useState } from "react";
import { Eye, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  isOrdinaryTagObservationDate,
  validateOrdinaryTagObservationConfig,
  type OrdinaryTagObservationConfig,
} from "@shared/ordinary-tag-observation";

export interface OrdinaryTagObservationEditorProps {
  ledgerId: number;
  categoryId: number;
  targetUserId: number;
  targetName?: string;
  referenceInitialAmount?: number | string;
  accentColor?: string;
}

export type OrdinaryObservationDraft = {
  enabled: boolean;
  initialAmount: string;
  ratio: string;
  startDate: string;
  pauseDate: string;
};

type DraftSource = "empty" | "saved" | "preview";
export type OrdinaryObservationEditorState = {
  scope: string;
  draft: OrdinaryObservationDraft;
  baseline: OrdinaryObservationDraft;
  source: DraftSource;
  dirty: boolean;
};
export type OrdinaryObservationEditorAction =
  | { type: "hydrate"; scope: string; config: OrdinaryTagObservationConfig | null; source: DraftSource }
  | { type: "edit"; scope: string; patch: Partial<OrdinaryObservationDraft> }
  | { type: "saved"; scope: string; config: OrdinaryTagObservationConfig; source: DraftSource; submitted: OrdinaryObservationDraft }
  | { type: "discard"; scope: string };

export const ordinaryObservationPreviewKey = (userId: number, categoryId: number) =>
  `ordinary-tag-observation-preview:${userId}:${categoryId}`;

const emptyDraft = (): OrdinaryObservationDraft => ({
  enabled: false, initialAmount: "", ratio: "", startDate: "", pauseDate: "",
});
const configToDraft = (config: OrdinaryTagObservationConfig | null): OrdinaryObservationDraft => config ? ({
  enabled: config.enabled,
  initialAmount: String(config.initialAmount),
  ratio: String(config.ratio),
  startDate: config.startDate,
  pauseDate: config.pauseDate || "",
}) : emptyDraft();
const draftsEqual = (left: OrdinaryObservationDraft, right: OrdinaryObservationDraft) =>
  left.enabled === right.enabled && left.initialAmount === right.initialAmount && left.ratio === right.ratio
  && left.startDate === right.startDate && left.pauseDate === right.pauseDate;

export function createOrdinaryObservationEditorState(scope: string): OrdinaryObservationEditorState {
  const draft = emptyDraft();
  return { scope, draft, baseline: draft, source: "empty", dirty: false };
}

// 所有动作带身份键；后台轮询和其他成员的迟到结果都不能覆盖当前未保存输入。
export function ordinaryObservationEditorReducer(
  state: OrdinaryObservationEditorState,
  action: OrdinaryObservationEditorAction,
): OrdinaryObservationEditorState {
  if (action.scope !== state.scope) return state;
  if (action.type === "hydrate") {
    if (state.dirty) return state;
    const draft = configToDraft(action.config);
    return { ...state, draft, baseline: draft, source: action.config ? action.source : "empty", dirty: false };
  }
  if (action.type === "discard") return { ...state, draft: { ...state.baseline }, dirty: false };
  if (action.type === "edit") {
    const draft = { ...state.draft, ...action.patch };
    return { ...state, draft, dirty: !draftsEqual(draft, state.baseline) };
  }
  const baseline = configToDraft(action.config);
  // 保存期间如有新输入，成功回执只更新保存基线，不丢弃新草稿。
  const draft = draftsEqual(state.draft, action.submitted) ? baseline : state.draft;
  return { ...state, baseline, draft, source: action.source, dirty: !draftsEqual(draft, baseline) };
}

export function ordinaryObservationConfigFromDraft(draft: OrdinaryObservationDraft): OrdinaryTagObservationConfig {
  // 即使关闭，也保留明确填写的参数；空值绝不隐式转换成虚构的 0。
  if (!draft.initialAmount.trim() || !Number.isFinite(Number(draft.initialAmount)) || Number(draft.initialAmount) < 0) {
    throw new Error("请明确填写非负的参考初始金额；该金额不会进入真实账户");
  }
  if (!draft.ratio.trim() || !Number.isFinite(Number(draft.ratio)) || Number(draft.ratio) < 0 || Number(draft.ratio) > 100) {
    throw new Error("请明确填写 0 至 100% 之间的观察比例");
  }
  if (!isOrdinaryTagObservationDate(draft.startDate)) throw new Error("请选择有效的观察开始日期");
  if (draft.pauseDate && (!isOrdinaryTagObservationDate(draft.pauseDate) || draft.pauseDate < draft.startDate)) {
    throw new Error("观察暂停日期不能早于开始日期");
  }
  return validateOrdinaryTagObservationConfig({
    enabled: draft.enabled, initialAmount: Number(draft.initialAmount), ratio: Number(draft.ratio),
    startDate: draft.startDate, pauseDate: draft.pauseDate || null,
  });
}

export function readOrdinaryObservationPreview(
  storage: Pick<Storage, "getItem">,
  userId: number,
  categoryId: number,
): OrdinaryTagObservationConfig | null {
  try {
    const raw = storage.getItem(ordinaryObservationPreviewKey(userId, categoryId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as OrdinaryTagObservationConfig;
    if (typeof value.enabled !== "boolean" || typeof value.initialAmount !== "number" || typeof value.ratio !== "number"
      || typeof value.startDate !== "string" || !(value.pauseDate === null || typeof value.pauseDate === "string")) return null;
    return ordinaryObservationConfigFromDraft(configToDraft(value));
  } catch {
    return null;
  }
}

type ObservationSaveInput = {
  ledgerId: number;
  categoryId: number;
  targetUserId: number;
  config: OrdinaryTagObservationConfig;
};

// DEV 在这里先返回，绝不执行任何 POST 或真实资金 mutation。依赖注入仅用于离线测试。
export async function saveOrdinaryObservationConfig(
  input: ObservationSaveInput,
  dependencies: {
    isDev: boolean;
    storage: Pick<Storage, "setItem">;
    dispatchPreviewChange: (detail: { userId: number; categoryId: number }) => void;
    mutate: (input: ObservationSaveInput) => Promise<{ success: true; config: OrdinaryTagObservationConfig }>;
  },
): Promise<OrdinaryTagObservationConfig> {
  if (input.ledgerId !== 37 || !Number.isSafeInteger(input.categoryId) || input.categoryId <= 0
    || !Number.isSafeInteger(input.targetUserId) || input.targetUserId <= 0) {
    throw new Error("普通标签观察仅支持 37 号账本的有效成员和标签");
  }
  const config = ordinaryObservationConfigFromDraft(configToDraft(input.config));
  if (dependencies.isDev) {
    dependencies.storage.setItem(ordinaryObservationPreviewKey(input.targetUserId, input.categoryId), JSON.stringify(config));
    dependencies.dispatchPreviewChange({ userId: input.targetUserId, categoryId: input.categoryId });
    return config;
  }
  const result = await dependencies.mutate({ ...input, config });
  return result.config;
}

// 身份切换直接重建内部组件，不会出现一帧旧成员数据，也不复用旧保存状态。
export default function OrdinaryTagObservationEditor(props: OrdinaryTagObservationEditorProps) {
  if (props.ledgerId !== 37 || !Number.isSafeInteger(props.categoryId) || props.categoryId <= 0
    || !Number.isSafeInteger(props.targetUserId) || props.targetUserId <= 0) return null;
  return <ScopedOrdinaryTagObservationEditor key={`${props.ledgerId}:${props.targetUserId}:${props.categoryId}`} {...props} />;
}

function ScopedOrdinaryTagObservationEditor({
  ledgerId, categoryId, targetUserId, targetName, referenceInitialAmount, accentColor = "#7C5A9E",
}: OrdinaryTagObservationEditorProps) {
  const isDev = import.meta.env.DEV;
  const scope = `${ledgerId}:${targetUserId}:${categoryId}`;
  const id = useId();
  const [state, dispatch] = useReducer(ordinaryObservationEditorReducer, scope, createOrdinaryObservationEditorState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = (trpc as any).ledger.adminGetOrdinaryTagObservationConfig.useQuery(
    { ledgerId: 37, categoryId, targetUserId },
    { refetchInterval: 2000, refetchIntervalInBackground: false, retry: false, placeholderData: undefined },
  );
  const mutation = (trpc as any).ledger.adminSetOrdinaryTagObservationConfig.useMutation();

  useEffect(() => {
    const hydrate = () => {
      let preview: OrdinaryTagObservationConfig | null = null;
      if (isDev) {
        try { preview = readOrdinaryObservationPreview(window.sessionStorage, targetUserId, categoryId); } catch { /* 浏览器存储可能禁用 */ }
      }
      if (preview) dispatch({ type: "hydrate", scope, config: preview, source: "preview" });
      else if (query.data !== undefined) dispatch({ type: "hydrate", scope, config: query.data.config ?? null, source: "saved" });
    };
    hydrate();
    if (!isDev) return;
    window.addEventListener("ordinary-tag-observation-preview-change", hydrate);
    return () => window.removeEventListener("ordinary-tag-observation-preview-change", hydrate);
  }, [isDev, scope, targetUserId, categoryId, query.data, query.dataUpdatedAt]);

  const edit = (patch: Partial<OrdinaryObservationDraft>) => {
    setError(null);
    dispatch({ type: "edit", scope, patch });
  };
  const save = async () => {
    if (!state.dirty || saving || (!isDev && (query.isError || query.data === undefined))) return;
    const submitted = { ...state.draft };
    try {
      const config = ordinaryObservationConfigFromDraft(submitted);
      if (!isDev && config.enabled && !state.baseline.enabled && !window.confirm('确认切换观察？保存后该标签的实际比例与实际权益设为0，观察不占实际分配。本金、押金、钱包和已结算历史不变；关闭观察不会自动恢复原实际比例。')) return;
      setSaving(true);
      setError(null);
      const savedConfig = await saveOrdinaryObservationConfig({ ledgerId, categoryId, targetUserId, config }, {
        isDev,
        // 正式环境不读取 sessionStorage；DEV 如存储不可用，报错并保持未保存草稿。
        storage: { setItem: (key, value) => window.sessionStorage.setItem(key, value) },
        dispatchPreviewChange: (detail) => window.dispatchEvent(new CustomEvent("ordinary-tag-observation-preview-change", { detail })),
        mutate: (input) => mutation.mutateAsync(input),
      });
      dispatch({ type: "saved", scope, config: savedConfig, source: isDev ? "preview" : "saved", submitted });
      toast.success(isDev ? "观察预览已保存至当前会话，未写入正式账本" : savedConfig.enabled ? "观察已保存，不计入实际分配" : "观察已关闭，实际比例需另行分配");
      if (!isDev) void query.refetch();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "独立观察保存失败";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };
  const reference = referenceInitialAmount === undefined || referenceInitialAmount === null
    || String(referenceInitialAmount).trim() === "" ? null : Number(referenceInitialAmount);
  const hasReference = reference !== null && Number.isFinite(reference) && reference >= 0;
  const inputsDisabled = saving || (!isDev && (query.data === undefined || query.isError));
  const inputClass = "h-9 w-full min-w-0 rounded-lg border border-purple-100 bg-white px-2 text-sm text-gray-800 outline-none focus:border-purple-400 disabled:opacity-60";
  const { draft } = state;

  return (
    <section data-ordinary-tag-observation-editor={`${targetUserId}:${categoryId}`} className="min-w-0 space-y-2 rounded-xl border border-purple-100 bg-purple-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold" style={{ color: accentColor }}>
          <Eye size={14} className="shrink-0" />
          <span>普通标签独立观察</span>
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-normal">{draft.enabled ? "观察开启" : "观察关闭"}</span>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600" htmlFor={`${id}-enabled`}>
          <span>观察开关</span>
          <input id={`${id}-enabled`} type="checkbox" role="switch" aria-label={`${targetName || `用户${targetUserId}`}的独立观察开关`} checked={draft.enabled} disabled={inputsDisabled} onChange={(event) => edit({ enabled: event.target.checked })} className="h-4 w-4 accent-purple-600" />
        </label>
      </div>
      <p className="text-[11px] leading-5 text-gray-500">观察收益用于体验，不进账、不参与结算。开启并保存后，该标签的实际比例和实际权益设为0；本金、显示开关、保证金、钱包及历史记录保留。关闭保留观察参数，不自动恢复实际比例；观察暂停不触发资金处理。</p>
      {isDev && <p className="rounded-md bg-white px-2 py-1 text-[11px] leading-4 text-purple-700">本地会话预览：独立保存仅存在当前浏览器会话，不会提交正式账本。</p>}
      {query.isLoading && state.source !== "preview" && <p className="text-[11px] text-gray-500">正在读取独立观察配置…</p>}
      {query.isError && <p className="text-[11px] leading-4 text-amber-700">独立配置读取失败，不代表已关闭观察。{isDev ? "可明确试填本地预览，正式账本不受影响。" : "请重试后再编辑保存。"}<button type="button" onClick={() => void query.refetch()} className="ml-1 underline">重试读取</button></p>}
      {!query.isLoading && !query.isError && state.source === "empty" && <p className="text-[11px] text-gray-500">尚无独立观察配置，默认关闭；参考金额、比例和日期需明确填写。</p>}
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <label className="min-w-0" htmlFor={`${id}-amount`}>
          <span className="mb-1 block text-[11px] text-gray-500">参考初始金额（元）</span>
          <input id={`${id}-amount`} type="number" min={0} step="any" inputMode="decimal" value={draft.initialAmount} disabled={inputsDisabled} onChange={(event) => edit({ initialAmount: event.target.value })} placeholder={hasReference ? `真实起点参考：${reference}` : "请明确填写参考金额"} className={inputClass} />
        </label>
        <label className="min-w-0" htmlFor={`${id}-ratio`}>
          <span className="mb-1 block text-[11px] text-gray-500">观察比例（%）</span>
          <input id={`${id}-ratio`} type="number" min={0} max={100} step="any" inputMode="decimal" value={draft.ratio} disabled={inputsDisabled} onChange={(event) => edit({ ratio: event.target.value })} placeholder="0 至 100%" className={inputClass} />
        </label>
        <label className="min-w-0" htmlFor={`${id}-start`}>
          <span className="mb-1 block text-[11px] text-gray-500">观察开始日期</span>
          <input id={`${id}-start`} type="date" value={draft.startDate} disabled={inputsDisabled} onChange={(event) => edit({ startDate: event.target.value })} className={inputClass} />
        </label>
        <label className="min-w-0" htmlFor={`${id}-pause`}>
          <span className="mb-1 block text-[11px] text-gray-500">观察暂停日期（可留空）</span>
          <input id={`${id}-pause`} type="date" min={draft.startDate || undefined} value={draft.pauseDate} disabled={inputsDisabled} onChange={(event) => edit({ pauseDate: event.target.value })} className={inputClass} />
        </label>
      </div>
      {hasReference && <button type="button" disabled={inputsDisabled} onClick={() => edit({ initialAmount: String(reference) })} className="rounded-lg bg-white px-2 py-1.5 text-left text-[11px] leading-4 text-purple-700 disabled:opacity-50">明确填入已保存真实初始金额 ¥{reference.toLocaleString("zh-CN", { maximumFractionDigits: 4 })} 作为观察参考（不复制比例或日期）</button>}
      {error && <p role="alert" className="text-xs leading-5 text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-gray-500" aria-live="polite">{state.dirty ? "观察有未保存草稿" : state.source === "preview" ? "已保存本地预览" : state.source === "saved" ? "已读取正式独立配置" : "未配置"}</span>
        <div className="flex flex-wrap items-center gap-2">
          {state.dirty && <button type="button" disabled={saving} onClick={() => { dispatch({ type: "discard", scope }); setError(null); }} className="h-8 px-2 text-xs text-gray-500">撤销观察草稿</button>}
          <button type="button" onClick={() => void save()} disabled={!state.dirty || inputsDisabled} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-white disabled:opacity-40" style={{ backgroundColor: accentColor }}>
            <Save size={12} />{saving ? "观察保存中…" : isDev ? "保存观察预览" : "独立保存观察"}
          </button>
        </div>
      </div>
    </section>
  );
}
