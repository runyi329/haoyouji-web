import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portfolioCurrency, portfolioQuotePrefix } from "@shared/portfolio-instruments";
import { stockLotDownsideAutoThreshold } from "@shared/stock-lot-downside";
import type { StockLotDownsideRule } from "@shared/stock-lot-downside";
import type { EditableStockBuyOrder } from "./StockTagBuyEditDialog";

export type StockLotDownsideRuleDraft = {
  enabled: boolean;
  thresholdPrice: number;
  downsidePercent: number;
  startDate: string;
  activationMode?: "manual";
};
/** Auto payload deliberately has no threshold, percent, dates or trigger/audit evidence. */
export type StockLotDownsideAutoDraft = {
  enabled: boolean;
  activationMode: "auto_drop";
  autoDropPercent: number;
};
export type StockLotDownsideRuleSaveDraft = (StockLotDownsideRuleDraft | StockLotDownsideAutoDraft) & { expectedVersion: number };
export type StockLotDownsideRuleView = Omit<StockLotDownsideRuleDraft, "startDate" | "activationMode"> & {
  lotId: number;
  version: number;
  startDate?: string;
  effectiveAt?: string | Date | null;
  baselineStatus?: StockLotDownsideRule["baselineStatus"];
  baselineSource?: StockLotDownsideRule["baselineSource"];
  baselineRawPrice?: number;
  baselineCountedPrice?: number;
  activationMode?: StockLotDownsideRule["activationMode"];
  autoDropPercent?: number;
  autoEntryPrice?: number;
  armedAt?: string;
  triggeredAt?: string;
  triggerPrice?: number;
  triggerQuoteAsOf?: string;
  triggerSource?: string;
};
export type StockTagDownsidePreview = {
  rules: Record<number, StockLotDownsideRuleView>;
  /** Implementations must branch on activationMode, never coerce auto into a manual rule. */
  save: (lotId: number, values: StockLotDownsideRuleSaveDraft) => Promise<void>;
};

type Props = {
  categoryId: number;
  order: EditableStockBuyOrder;
  canEdit: boolean;
  readOnlyPreview?: boolean;
  isViewingAs?: boolean;
  onClose: () => void;
  onPendingChange?: (pending: boolean) => void;
  currentMarketPrice?: number | null;
  currentCountedPrice?: number | null;
  /** The central inline editor already renders the real scoped valuation above the form. */
  hideValuationSummary?: boolean;
  onPreviewDownsideChange?: (lotId: number, rule: StockLotDownsideRuleSaveDraft) => Promise<void> | void;
  previewDownsideRule?: StockLotDownsideRuleView | null;
};

/** Calendar validation, without Date's silent rollover of dates such as February 30. */
export function isValidStockTagDownsideStartDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Use Beijing's calendar day, never UTC's toISOString().slice(0, 10). */
export function beijingStockTagDownsideDate(value: string | Date | number = Date.now()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

export function validateStockTagDownsideDraft(enabled: boolean, threshold: string, percent: string, startDate: string): StockLotDownsideRuleDraft | string {
  const thresholdPrice = Number(threshold);
  const downsidePercent = Number(percent);
  if (!threshold.trim() || !Number.isFinite(thresholdPrice) || thresholdPrice <= 0) return "请输入大于0的价格门槛";
  if (!percent.trim() || !Number.isFinite(downsidePercent) || downsidePercent < 0 || downsidePercent > 100) return "剩余保证金比例须为0–100%";
  if (!isValidStockTagDownsideStartDate(startDate)) return "请选择有效的启用日期（YYYY-MM-DD）";
  return { enabled, thresholdPrice, downsidePercent, startDate };
}

export function validateStockTagDownsideAutoDraft(enabled: boolean, drop: string): StockLotDownsideAutoDraft | string {
  const autoDropPercent = Number(drop);
  if (!drop.trim() || !Number.isFinite(autoDropPercent) || autoDropPercent <= 0 || autoDropPercent >= 100) return "下跌百分比须大于0且小于100%";
  if (Number(autoDropPercent.toFixed(8)) !== autoDropPercent) return "下跌百分比最多支持8位小数";
  return { enabled, activationMode: "auto_drop", autoDropPercent };
}

/** Preserve the confirmation instant down to milliseconds, not a calendar-day approximation. */
export function beijingStockTagDownsideTimestamp(value?: string | Date | null): string {
  if (!value) return "待核验";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "待核验";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}.${String(date.getUTCMilliseconds()).padStart(3, "0")}（北京时间）`;
}

/** Read DTO status only: no market comparison, client trigger, time generation or writes. */
export function stockTagDownsideAutoStatus(rule: StockLotDownsideRuleView | null | undefined): "waiting" | "triggered" | "disabled" | "invalid" | null {
  if (rule?.activationMode !== "auto_drop") return null;
  if (!rule.enabled) return "disabled";
  try {
    const threshold = stockLotDownsideAutoThreshold(rule.autoEntryPrice ?? NaN, rule.autoDropPercent ?? NaN);
    if (!Number.isFinite(threshold) || rule.thresholdPrice !== threshold || rule.downsidePercent !== 0
      || !Number.isFinite(Date.parse(rule.armedAt ?? ""))) return "invalid";
    if ((rule.baselineRawPrice !== undefined && rule.baselineRawPrice !== threshold)
      || (rule.baselineCountedPrice !== undefined && rule.baselineCountedPrice !== threshold)) return "invalid";
    const effective = rule.effectiveAt ? Date.parse(String(rule.effectiveAt)) : NaN;
    if (!Number.isFinite(effective) || rule.startDate !== beijingStockTagDownsideDate(effective)
      || rule.baselineStatus !== "ready" || rule.baselineSource !== "owner_threshold") return "invalid";
    if (rule.triggeredAt === undefined) return effective === Date.parse(rule.armedAt!)
      && rule.triggerPrice === undefined && rule.triggerQuoteAsOf === undefined && rule.triggerSource === undefined ? "waiting" : "invalid";
    const triggered = Date.parse(rule.triggeredAt), armed = Date.parse(rule.armedAt!);
    const quote = Date.parse(rule.triggerQuoteAsOf ?? "");
    if (!Number.isFinite(triggered) || triggered < armed || !Number.isFinite(quote) || quote < armed || quote > triggered
      || typeof rule.triggerPrice !== "number" || !Number.isFinite(rule.triggerPrice) || rule.triggerPrice <= 0 || rule.triggerPrice > threshold
      || !rule.triggerSource?.trim() || rule.baselineStatus !== "ready" || rule.baselineSource !== "owner_threshold"
      || Date.parse(String(rule.effectiveAt ?? "")) !== triggered) return "invalid";
    return "triggered";
  } catch { return "invalid"; }
}

/** Only the owner's active right tab mounts this hook tree. No original-order mutation here. */
export function StockTagDownsideRulePanel({ categoryId, order, canEdit, readOnlyPreview = false, isViewingAs = false, onClose, onPendingChange, onPreviewDownsideChange, previewDownsideRule, currentMarketPrice, currentCountedPrice, hideValuationSummary = false }: Props) {
  const utils = trpc.useUtils();
  const localPreview = readOnlyPreview || import.meta.env.DEV;
  const canPreviewSave = localPreview && !!onPreviewDownsideChange && !isViewingAs && canEdit;
  const query = trpc.ledger.getStockLotDownsideRule.useQuery(
    { ledgerId: 37, categoryId, lotId: order.lotId },
    { enabled: canEdit && !isViewingAs && !localPreview && Number.isInteger(order.lotId) && order.lotId > 0, staleTime: 0, refetchOnWindowFocus: false, retry: false },
  );
  const savedRule = localPreview ? previewDownsideRule ?? order.currentDownsideRule : query.data;
  const [enabled, setEnabled] = useState(false);
  const [activationMode, setActivationMode] = useState<"manual" | "auto_drop">("manual");
  const [autoDrop, setAutoDrop] = useState("10");
  const [rearmConfirmed, setRearmConfirmed] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [percent, setPercent] = useState("20");
  const [startDate, setStartDate] = useState(() => beijingStockTagDownsideDate());
  const [previewSaved, setPreviewSaved] = useState(false);
  const [previewSavedRevision, setPreviewSavedRevision] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [appliedPrefillKey, setAppliedPrefillKey] = useState<string | null>(null);
  const mutation = trpc.ledger.setStockLotDownsideRule.useMutation({
    onSuccess: rule => {
      const saved: StockLotDownsideRuleView | null | undefined = rule;
      const waiting = saved?.baselineStatus === "pending";
      toast.success(saved?.activationMode === "auto_drop"
        ? !saved.enabled ? "自动触发规则已保存到正式账目并关闭；当前价格变动完全计入，不会自动卖出。"
          : "自动触发规则已重新预设到正式账目，待后台有效行情扫描确认触发；触发前完全计入，不追溯历史，不会自动卖出。"
        : waiting
        ? saved.baselineSource === "owner_threshold"
          ? "规则已保存到正式账目，以管理员填写的价格门槛为依据；启用前不变，启用日期起重算；当前仍待生效或核验，尚未确认日结和客户收益重算完成"
          : "规则已保存到正式账目，旧版规则沿用原算法，仍待生效或核验；尚未确认日结和客户收益重算完成"
        : "欠保证金规则已保存到正式账目；新规则以管理员填写的价格门槛为依据，启用前不变，启用日期起重算可核验的日结和客户收益；缺少历史成交或份额证据的记录保留待核验");
      void utils.ledger.getStockLotDownsideRule.invalidate({ ledgerId: 37, categoryId, lotId: order.lotId });
      void utils.ledger.getForcedLiquidationSettings.invalidate({ ledgerId: 37 });
      void utils.ledger.getForcedLiquidationSettingDetail.invalidate({ ledgerId: 37, categoryId, lotId: order.lotId });
      for (const name of ["getStockTagPortfolio", "getStockLotParticipationMatrix", "getMyStockTagParticipantPortfolio", "getStockTagPublicPortfolio", "getStockTagDailySnapshots", "getStockTagCalendar"] as const) {
        void utils.ledger[name].invalidate({ ledgerId: 37, categoryId });
      }
      // Refresh only R1 consumers, not every mounted query across the whole website.
      // Ledger-only inputs also match cached viewer-specific AI/overview query keys.
      for (const name of ["getMyR1AiParticipationPortfolio", "getMyLedger37AiStockPool", "getMyLedger37AiWalletValue", "getMyLedger37HoldingSources", "getMyStockTagOverview", "getMyStockTagObservationOverview", "getCategories"] as const) {
        void utils.ledger[name].invalidate({ ledgerId: 37 });
      }
      onClose();
    },
    onError: error => {
      toast.error(`规则保存失败：${error.message}`);
      // 并发版本冲突后重新读取，不用旧版本静默覆盖其他操作者的保存。
      void query.refetch();
    },
  });
  const pending = mutation.isPending || previewPending;
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);
  const loading = !localPreview && (query.isPending || query.isFetching);
  const ruleReadError = !localPreview && !!query.error;
  const prefillKey = JSON.stringify([order.lotId, savedRule?.version, savedRule?.enabled, savedRule?.thresholdPrice, savedRule?.downsidePercent, savedRule?.startDate, savedRule?.effectiveAt, savedRule?.activationMode, savedRule?.autoDropPercent, savedRule?.armedAt, savedRule?.triggeredAt]);
  useEffect(() => {
    // A failed/stale read or in-flight save must not overwrite the user's draft.
    if (pending || loading || ruleReadError || appliedPrefillKey === prefillKey) return;
    setEnabled(savedRule?.enabled ?? false);
    setActivationMode(savedRule?.activationMode === "auto_drop" ? "auto_drop" : "manual");
    setAutoDrop(String(savedRule?.autoDropPercent ?? 10));
    setRearmConfirmed(false);
    setThreshold(String(savedRule?.thresholdPrice ?? order.marketPrice ?? ""));
    setPercent(String(savedRule?.downsidePercent ?? 20));
    setStartDate(savedRule?.startDate && isValidStockTagDownsideStartDate(savedRule.startDate)
      ? savedRule.startDate
      : (savedRule?.effectiveAt ? beijingStockTagDownsideDate(savedRule.effectiveAt) : "") || beijingStockTagDownsideDate());
    setPreviewSaved(previewSavedRevision === `${order.lotId}:${savedRule?.version}`);
    setAppliedPrefillKey(prefillKey);
  }, [prefillKey, appliedPrefillKey, pending, loading, ruleReadError, previewSavedRevision]);
  const savedAutoStatus = stockTagDownsideAutoStatus(savedRule);
  const rearmingTriggered = activationMode === "auto_drop" && enabled && savedRule?.activationMode === "auto_drop" && !!savedRule.triggeredAt;
  const blocked = pending || !canEdit || isViewingAs || loading || (!localPreview && !!query.error) || (localPreview && !canPreviewSave) || (rearmingTriggered && !rearmConfirmed);
  const save = async () => {
    if (blocked || !Number.isInteger(categoryId) || categoryId <= 0 || !Number.isInteger(order.lotId) || order.lotId <= 0) return;
    const draft = activationMode === "auto_drop" ? validateStockTagDownsideAutoDraft(enabled, autoDrop) : validateStockTagDownsideDraft(enabled, threshold, percent, startDate);
    if (typeof draft === "string") return toast.error(draft);
    const expectedVersion = savedRule?.version ?? 0;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return toast.error("规则版本无效，请重新读取后再保存");
    if (draft.activationMode === "auto_drop") {
      try {
        const computed = stockLotDownsideAutoThreshold(order.executionPrice, draft.autoDropPercent);
        if (!Number.isFinite(computed) || computed <= 0) throw new Error("invalid buy price");
      }
      catch { return toast.error("缺少有效的真实买入价，不能预设自动触发规则"); }
    }
    const values: StockLotDownsideRuleSaveDraft = { ...draft, expectedVersion: savedRule?.version ?? 0 };
    if (localPreview) {
      if (!canPreviewSave || !onPreviewDownsideChange) return;
      setPreviewPending(true);
      try {
        await onPreviewDownsideChange(order.lotId, values);
        setPreviewSavedRevision(`${order.lotId}:${values.expectedVersion + 1}`);
        setPreviewSaved(true);
        toast.success("已保存本地预览规则，不会写入正式账目");
      } catch (error) {
        toast.error(`预览规则保存失败：${error instanceof Error ? error.message : "请重试"}`);
      } finally { setPreviewPending(false); }
      return;
    }
    mutation.mutate({ ledgerId: 37, categoryId, lotId: order.lotId, ...values });
  };
  const currency = portfolioCurrency(order.symbol);
  const quote = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "待更新" : `${portfolioQuotePrefix(currency)}${value.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}`;
  const actualPrice = currentMarketPrice === undefined ? order.marketPrice : currentMarketPrice;
  const countedPrice = savedAutoStatus === "waiting" || savedAutoStatus === "disabled" ? actualPrice : savedAutoStatus === "invalid" || (savedRule?.enabled && savedRule.baselineStatus === "pending") ? null : currentCountedPrice === undefined ? order.currentCountedPrice ?? (savedRule?.enabled ? null : actualPrice) : currentCountedPrice;
  const remainingPercent = activationMode === "auto_drop" ? "0" : percent.trim() || "0";
  const autoThreshold = (() => {
    if (typeof validateStockTagDownsideAutoDraft(enabled, autoDrop) === "string") return null;
    try { return stockLotDownsideAutoThreshold(order.executionPrice, Number(autoDrop)); } catch { return null; }
  })();
  if (!canEdit || isViewingAs) return null;
  return <div role="tabpanel" id="stock-buy-downside-panel" aria-labelledby="stock-buy-downside-tab" className="space-y-3">
    {!hideValuationSummary && <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#FFF5F5] px-3 py-2 text-xs">
      <div><div className="text-[11px] text-gray-500">实际当前价 · {currency}</div><div className="mt-1 font-semibold">{quote(actualPrice)}</div></div>
      <div><div className="text-[11px] text-gray-500">当前计入价 · {currency}</div><div className="mt-1 font-semibold text-[#C62828]">{quote(countedPrice)}</div></div>
    </div>}
    <div role="tablist" aria-label="欠保证金启用模式" className="grid grid-cols-2 gap-2">
      {(["manual", "auto_drop"] as const).map(mode => <Button key={mode} id={`stock-downside-mode-${mode}`} type="button" role="tab" aria-selected={activationMode === mode} variant="outline" disabled={pending || loading} className={activationMode === mode ? "border-red-200 bg-red-50 text-[#C62828]" : "text-gray-600"} onClick={() => {
        if (!pending && !loading) { setActivationMode(mode); setRearmConfirmed(false); setPreviewSaved(false); }
      }}>{mode === "manual" ? "手动设置" : "自动触发"}</Button>)}
    </div>
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-[#F0DADA] px-3 text-sm">
      <span>启用欠保证金</span><input id="stock-downside-enabled" type="checkbox" role="switch" aria-checked={enabled} aria-label="启用欠保证金" checked={enabled} disabled={pending || loading} onChange={event => { if (!pending && !loading) { setEnabled(event.target.checked); setPreviewSaved(false); } }} className="h-4 w-4 accent-[#C62828]" />
    </label>
    {activationMode === "auto_drop" ? <div className="space-y-3">
      <div><Label htmlFor="stock-downside-auto-drop">下跌百分比（下跌X%时触发）</Label><div className="relative mt-1"><Input id="stock-downside-auto-drop" type="number" inputMode="decimal" min="0" max="100" step="any" value={autoDrop} disabled={pending || loading} onChange={event => {
        if (!pending && !loading) { setAutoDrop(event.target.value); setRearmConfirmed(false); setPreviewSaved(false); }
      }} className="pr-8" /><span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span></div><p className="mt-1 text-[11px] text-gray-500">可自由填写大于0且小于100的百分比，最多8位小数；10%仅为默认示例。</p></div>
      <div className="rounded-lg bg-[#FFF5F5] px-3 py-2 text-xs leading-5">
        <div>真实买入价 · {currency}：{quote(order.executionPrice)}</div>
        <div>触发价 · {currency}：{autoThreshold === null ? "待填写有效下跌比例或核验买入价" : quote(autoThreshold)}</div>
        <div className="font-medium text-[#A42222]">触发后固定剩0%保证金（不可调整）</div>
      </div>
      {rearmingTriggered && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900"><input id="stock-downside-rearm-confirm" type="checkbox" checked={rearmConfirmed} disabled={pending || loading} onChange={event => { if (!pending && !loading) setRearmConfirmed(event.target.checked); }} className="mt-1 h-4 w-4 shrink-0" /><span>我确认重新预设：将追加待触发新版本，当前恢复完全计入；旧首次触发审计保留，新的扫描确认不继承旧时间。</span></label>}
    </div> : <div className="grid grid-cols-2 gap-3">
      <div className="space-y-3">
        <div><Label htmlFor="stock-downside-threshold">价格门槛（{currency}）</Label><Input id="stock-downside-threshold" type="number" inputMode="decimal" min="0" step="any" value={threshold} disabled={pending || loading} onChange={event => { if (!pending && !loading) { setThreshold(event.target.value); setPreviewSaved(false); } }} className="mt-1" /></div>
        <div><Label htmlFor="stock-downside-start-date">启用日期</Label><Input id="stock-downside-start-date" type="date" value={startDate} disabled={pending || loading} onChange={event => { if (!pending && !loading) { setStartDate(event.target.value); setPreviewSaved(false); } }} className="mt-1 min-w-0" /></div>
      </div>
      <div><Label htmlFor="stock-downside-percent">剩{remainingPercent}%保证金</Label><div className="relative mt-1"><Input id="stock-downside-percent" type="number" inputMode="decimal" min="0" max="100" step="any" value={percent} disabled={pending || loading} onChange={event => { if (!pending && !loading) { setPercent(event.target.value); setPreviewSaved(false); } }} className="pr-8" /><span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span></div></div>
    </div>}
    {activationMode === "auto_drop" ? <div className="rounded-lg bg-[#FAF3ED] px-3 py-2 text-[11px] leading-5 text-gray-600">
      保存即重新预设，不会因为保存时价格已低于触发价而立即触发。后台首次扫描确认新的有效当前价≤真实买入价×(1−下跌百分比/100)后，才从该扫描确认瞬间起计入，不从当天00:00起、不追溯历史。
      <div className="mt-1">触发前价格变动完全计入；触发后固定剩0%保证金，门槛以下计入价为门槛；涨回门槛恢复100%，再跌低仍按0%，首次触发审计不变。</div>
      <div className="mt-1">使用应用现有行情刷新，不保证逐秒扫描，也不代表市场首次触价时刻。用户豁免优先；关闭后完全计入。</div>
      <div className="mt-1 font-medium text-[#A42222]">这是收益计入口径，不是实际股票保本承诺；原始成交、真实行情、FX汇率和单股真实盈亏不变，不下单、不操作钱包，不会自动卖出。</div>
    </div> : <><div className="text-[11px] text-[#A42222]">剩{remainingPercent}%保证金：门槛以下的变动按{remainingPercent}%计算。</div>
    <div className="rounded-lg bg-[#FAF3ED] px-3 py-2 text-[11px] leading-5 text-gray-600">
      关闭后，从选定启用日期起的价格变动完全计入。新规则启用后，实际价格达到或超过门槛时，计入价就是实际价格；低于门槛时，计入价=门槛+(实际价格-门槛)×剩余保证金比例。剩0%保证金时，门槛以下计入价为门槛；回升至门槛后恢复完全计入，可反复恢复，并非永久冻结。
      <div className="mt-1">新规则以管理员填写的价格门槛为人工规则依据，不是外部历史报价；启用日期只控制适用范围，启用前计入口径不变。</div>
      <div className="mt-1">选定启用日期起的汇总、日结和客户收益将按新比例重算；原始成交、真实行情、FX汇率和单股真实盈亏不变。</div>
      <div className="mt-1">旧已保存规则沿用原算法，不自动转换为新规则。</div>
      <div className="mt-1">缺少可核验历史成交或份额证据的记录保留“待核验”，不会用0或今天的持仓代替。</div>
      <div className="mt-1 font-medium text-[#A42222]">这是收益计入口径，不是实际股票保本承诺；不改变真实开仓价、当前价或单笔真实浮盈，不下单、不操作钱包。</div>
    </div></>}
    {savedRule?.activationMode === "auto_drop" && <div role="status" className="space-y-1 rounded-lg bg-red-50 p-2 text-[11px] leading-5 text-gray-600">
      <div className="font-medium text-[#A42222]">已保存自动规则：{savedAutoStatus === "disabled" ? "已关闭" : savedAutoStatus === "waiting" ? "预设待触发" : savedAutoStatus === "triggered" ? "已触发" : "待核验（不确认生效）"}</div>
      <div>预设确认时间：{beijingStockTagDownsideTimestamp(savedRule.armedAt)}</div>
      {savedRule.triggeredAt && <><div>首次扫描确认时间：{beijingStockTagDownsideTimestamp(savedRule.triggeredAt)}</div><div>触发行情价 · {currency}：{quote(savedRule.triggerPrice)}</div><div>行情证据时间：{beijingStockTagDownsideTimestamp(savedRule.triggerQuoteAsOf)}</div><div>行情来源：{savedRule.triggerSource || "待核验"}</div></>}
      {savedAutoStatus === "waiting" && <div>触发前完全计入，预设规则当前财务影响为0；首次有效行情扫描确认后才生效。</div>}
    </div>}
    {savedRule?.activationMode !== "auto_drop" && savedRule && (savedRule.startDate || savedRule.effectiveAt) && <div className="text-[10px] text-gray-500">已保存启用日期：{savedRule.startDate || (savedRule.effectiveAt ? beijingStockTagDownsideDate(savedRule.effectiveAt) : "")}（北京时间）</div>}
    {savedRule?.activationMode !== "auto_drop" && savedRule?.baselineStatus === "pending" && <div role="status" className="text-xs text-[#A42222]">{savedRule.baselineSource === "owner_threshold"
      ? "规则已保存，以管理员填写的价格门槛为依据；启用前计入口径不变，启用日期起重算。当前仍待生效或核验，尚未确认日结和客户收益重算完成。"
      : "旧版规则已保存，沿用原算法，仍待生效或核验；尚未确认日结和客户收益重算完成，不自动转换为新规则。"}</div>}
    {activationMode === "manual" && isValidStockTagDownsideStartDate(startDate) && startDate > beijingStockTagDownsideDate() && <div role="status" className="text-[11px] text-gray-500">所选启用日期尚未到达；新规则以管理员填写的价格门槛为依据，启用前计入口径不变，启用日期起重算，不会立即按新规则计入。</div>}
    {loading && <div role="status" className="text-xs text-gray-500">正在读取当前规则…</div>}
    {query.error && !localPreview && <div role="alert" className="text-xs text-[#C62828]">规则读取失败，请重新打开后再保存。</div>}
    {localPreview && <div role="status" className="text-xs font-medium text-[#A42222]">仅本地试用，不改正式账目</div>}
    {localPreview && <div role="status" className="text-xs text-gray-500">{previewSaved ? "本地预览规则已保存，不会写入正式账目。" : canPreviewSave ? "可独立保存本地预览规则，不会写入正式账目。" : "此热链接仅展示；未连接本地预览保存，不会写入正式账目。"}</div>}
    {!localPreview && <div className="text-xs font-medium text-[#A42222]">保存会写入37号正式账目的欠保证金规则，并更新收益计入口径。</div>}
    <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { if (!pending) onClose(); }} disabled={pending}>取消</Button><Button className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]" onClick={save} disabled={blocked}>{pending ? "保存中…" : localPreview ? "保存预览规则" : activationMode === "auto_drop" && enabled ? "保存并重新预设" : "保存到正式账目"}</Button></div>
  </div>;
}
