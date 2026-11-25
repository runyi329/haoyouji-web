import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portfolioCurrency, portfolioQuotePrefix } from "@shared/portfolio-instruments";
import type { EditableStockBuyOrder } from "./StockTagBuyEditDialog";

export type StockLotDownsideRuleDraft = {
  enabled: boolean;
  thresholdPrice: number;
  downsidePercent: number;
  startDate: string;
};
export type StockLotDownsideRuleSaveDraft = StockLotDownsideRuleDraft & { expectedVersion: number };
export type StockLotDownsideRuleView = Omit<StockLotDownsideRuleDraft, "startDate"> & {
  lotId: number;
  version: number;
  startDate?: string;
  effectiveAt?: string | Date | null;
  baselineStatus?: "ready" | "pending";
};
export type StockTagDownsidePreview = {
  rules: Record<number, StockLotDownsideRuleView>;
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

/** Only the owner's active right tab mounts this hook tree. No original-order mutation here. */
export function StockTagDownsideRulePanel({ categoryId, order, canEdit, readOnlyPreview = false, isViewingAs = false, onClose, onPendingChange, onPreviewDownsideChange, previewDownsideRule, currentMarketPrice, currentCountedPrice }: Props) {
  const utils = trpc.useUtils();
  const localPreview = readOnlyPreview || import.meta.env.DEV;
  const canPreviewSave = localPreview && !!onPreviewDownsideChange && !isViewingAs && canEdit;
  const query = trpc.ledger.getStockLotDownsideRule.useQuery(
    { ledgerId: 37, categoryId, lotId: order.lotId },
    { enabled: canEdit && !isViewingAs && !localPreview && Number.isInteger(order.lotId) && order.lotId > 0, staleTime: 0, refetchOnWindowFocus: false, retry: false },
  );
  const savedRule = localPreview ? previewDownsideRule ?? order.currentDownsideRule : query.data;
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [percent, setPercent] = useState("20");
  const [startDate, setStartDate] = useState(() => beijingStockTagDownsideDate());
  const [previewSaved, setPreviewSaved] = useState(false);
  const [previewSavedRevision, setPreviewSavedRevision] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [appliedPrefillKey, setAppliedPrefillKey] = useState<string | null>(null);
  const mutation = trpc.ledger.setStockLotDownsideRule.useMutation({
    onSuccess: rule => {
      const waitingBaseline = rule && "baselineStatus" in rule && rule.baselineStatus === "pending";
      toast.success(waitingBaseline ? "规则已保存到正式账目，等待启用日期与可核验历史基准；尚未重算" : "欠保证金规则已保存到正式账目，将从选定启用日期起重算可核验的日结和客户收益；缺少历史证据的记录保留待核验");
      void utils.ledger.getStockLotDownsideRule.invalidate({ ledgerId: 37, categoryId, lotId: order.lotId });
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
  const prefillKey = JSON.stringify([order.lotId, savedRule?.version, savedRule?.enabled, savedRule?.thresholdPrice, savedRule?.downsidePercent, savedRule?.startDate, savedRule?.effectiveAt]);
  useEffect(() => {
    // A failed/stale read or in-flight save must not overwrite the user's draft.
    if (pending || loading || ruleReadError || appliedPrefillKey === prefillKey) return;
    setEnabled(savedRule?.enabled ?? false);
    setThreshold(String(savedRule?.thresholdPrice ?? order.marketPrice ?? ""));
    setPercent(String(savedRule?.downsidePercent ?? 20));
    setStartDate(savedRule?.startDate && isValidStockTagDownsideStartDate(savedRule.startDate)
      ? savedRule.startDate
      : (savedRule?.effectiveAt ? beijingStockTagDownsideDate(savedRule.effectiveAt) : "") || beijingStockTagDownsideDate());
    setPreviewSaved(previewSavedRevision === `${order.lotId}:${savedRule?.version}`);
    setAppliedPrefillKey(prefillKey);
  }, [prefillKey, appliedPrefillKey, pending, loading, ruleReadError, previewSavedRevision]);
  const blocked = pending || !canEdit || isViewingAs || loading || (!localPreview && !!query.error) || (localPreview && !canPreviewSave);
  const save = async () => {
    if (blocked || !Number.isInteger(categoryId) || categoryId <= 0 || !Number.isInteger(order.lotId) || order.lotId <= 0) return;
    const draft = validateStockTagDownsideDraft(enabled, threshold, percent, startDate);
    if (typeof draft === "string") return toast.error(draft);
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
  const countedPrice = savedRule?.enabled && savedRule.baselineStatus === "pending" ? null : currentCountedPrice === undefined ? order.currentCountedPrice ?? (savedRule?.enabled ? null : actualPrice) : currentCountedPrice;
  const remainingPercent = percent.trim() || "0";
  if (!canEdit || isViewingAs) return null;
  return <div role="tabpanel" id="stock-buy-downside-panel" aria-labelledby="stock-buy-downside-tab" className="space-y-3">
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#FFF5F5] px-3 py-2 text-xs">
      <div><div className="text-[11px] text-gray-500">实际当前价 · {currency}</div><div className="mt-1 font-semibold">{quote(actualPrice)}</div></div>
      <div><div className="text-[11px] text-gray-500">当前计入价 · {currency}</div><div className="mt-1 font-semibold text-[#C62828]">{quote(countedPrice)}</div></div>
    </div>
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-[#F0DADA] px-3 text-sm">
      <span>启用欠保证金</span><input id="stock-downside-enabled" type="checkbox" role="switch" aria-checked={enabled} aria-label="启用欠保证金" checked={enabled} disabled={pending || loading} onChange={event => { if (!pending && !loading) { setEnabled(event.target.checked); setPreviewSaved(false); } }} className="h-4 w-4 accent-[#C62828]" />
    </label>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-3">
        <div><Label htmlFor="stock-downside-threshold">价格门槛（{currency}）</Label><Input id="stock-downside-threshold" type="number" inputMode="decimal" min="0" step="any" value={threshold} disabled={pending || loading} onChange={event => { if (!pending && !loading) { setThreshold(event.target.value); setPreviewSaved(false); } }} className="mt-1" /></div>
        <div><Label htmlFor="stock-downside-start-date">启用日期</Label><Input id="stock-downside-start-date" type="date" value={startDate} disabled={pending || loading} onChange={event => { if (!pending && !loading) { setStartDate(event.target.value); setPreviewSaved(false); } }} className="mt-1 min-w-0" /></div>
      </div>
      <div><Label htmlFor="stock-downside-percent">剩{remainingPercent}%保证金</Label><div className="relative mt-1"><Input id="stock-downside-percent" type="number" inputMode="decimal" min="0" max="100" step="any" value={percent} disabled={pending || loading} onChange={event => { if (!pending && !loading) { setPercent(event.target.value); setPreviewSaved(false); } }} className="pr-8" /><span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span></div></div>
    </div>
    <div className="text-[11px] text-[#A42222]">剩{remainingPercent}%保证金：门槛以下的变动按{remainingPercent}%计算。</div>
    <div className="rounded-lg bg-[#FAF3ED] px-3 py-2 text-[11px] leading-5 text-gray-600">
      关闭后，从选定启用日期起的价格变动完全计入。启用后，实际价格达到或超过门槛的部分完全计入；跌破门槛后的变动按设置的剩余保证金比例计算。剩0%保证金时忽略门槛以下变动，回升至门槛后恢复完全计入，可反复恢复，并非永久冻结。
      <div className="mt-1">选定启用日期起的汇总、日结和客户收益将按新比例重算；原始成交、真实行情和单股真实盈亏不变。</div>
      <div className="mt-1">缺少可核验历史成交或份额证据的记录保留“待核验”，不会用0或今天的持仓代替。</div>
      <div className="mt-1 font-medium text-[#A42222]">这是收益计入口径，不是实际股票保本承诺；不改变真实开仓价、当前价或单笔真实浮盈，不下单、不操作钱包。</div>
    </div>
    {savedRule && (savedRule.startDate || savedRule.effectiveAt) && <div className="text-[10px] text-gray-500">已保存启用日期：{savedRule.startDate || (savedRule.effectiveAt ? beijingStockTagDownsideDate(savedRule.effectiveAt) : "")}（北京时间）</div>}
    {savedRule?.baselineStatus === "pending" && <div role="status" className="text-xs text-[#A42222]">规则已保存，等待启用日期与可核验历史基准；尚未重算日结和客户收益。</div>}
    {isValidStockTagDownsideStartDate(startDate) && startDate > beijingStockTagDownsideDate() && <div role="status" className="text-[11px] text-gray-500">所选启用日期尚未到达，需等待该日期与可核验历史基准，不会立即按新规则计入。</div>}
    {loading && <div role="status" className="text-xs text-gray-500">正在读取当前规则…</div>}
    {query.error && !localPreview && <div role="alert" className="text-xs text-[#C62828]">规则读取失败，请重新打开后再保存。</div>}
    {localPreview && <div role="status" className="text-xs font-medium text-[#A42222]">仅本地试用，不改正式账目</div>}
    {localPreview && <div role="status" className="text-xs text-gray-500">{previewSaved ? "本地预览规则已保存，不会写入正式账目。" : canPreviewSave ? "可独立保存本地预览规则，不会写入正式账目。" : "此热链接仅展示；未连接本地预览保存，不会写入正式账目。"}</div>}
    {!localPreview && <div className="text-xs font-medium text-[#A42222]">保存会写入37号正式账目的欠保证金规则，并更新收益计入口径。</div>}
    <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { if (!pending) onClose(); }} disabled={pending}>取消</Button><Button className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]" onClick={save} disabled={blocked}>{pending ? "保存中…" : localPreview ? "保存预览规则" : "保存到正式账目"}</Button></div>
  </div>;
}
