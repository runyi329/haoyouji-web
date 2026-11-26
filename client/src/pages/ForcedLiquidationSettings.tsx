import { Fragment, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { ChevronDown, ChevronLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ForcedLiquidationSettingDetail } from "@shared/forced-liquidation-display";
import ForcedLiquidationUserControl from "@/components/ForcedLiquidationUserControl";
import { parsePortfolioInstrument, portfolioDisplaySymbol } from "@shared/portfolio-instruments";
import {
  StockTagDownsideRulePanel,
  beijingStockTagDownsideDate,
  isValidStockTagDownsideStartDate,
  type StockLotDownsideRuleView,
} from "@/components/StockTagDownsideRulePanel";
import type { EditableStockBuyOrder } from "@/components/StockTagBuyEditDialog";

export type OrdinaryTagDownsideRule = {
  version: number;
  enabled: boolean;
  thresholdAmount: number;
  downsidePercent: number;
  startDate: string;
};
export type ForcedLiquidationStock = {
  lotId: number;
  eventId: number;
  positionNumber?: string;
  stockName: string;
  symbol: string;
  quantity: number;
  remainingQuantity: number;
  executionPrice: number;
  actualTradedAt: string;
  note: string;
  currentDownsideRule: StockLotDownsideRuleView | null;
  ineffectiveFunds?: number | null;
  ineffectiveCurrency?: string;
  ineffectiveFundsCny?: number | null;
};
export type ForcedLiquidationCategory = {
  categoryId: number;
  categoryName: string;
  accountingMode: "stock_portfolio" | "manual_balance";
  currency: "CNY";
  lifecycleStatus?: "active" | "paused" | "ended";
  lifecycleDate?: string | null;
  ordinaryRule: OrdinaryTagDownsideRule | null;
  stocks: ForcedLiquidationStock[];
  ineffectiveFunds?: number | null;
  ineffectiveCurrency?: string;
  ineffectiveFundsCny?: number | null;
};
type ForcedLiquidationList = { ledgerId: number; canEdit: boolean; categories: ForcedLiquidationCategory[] };
type Selection = { kind: "stock"; category: ForcedLiquidationCategory; stock: ForcedLiquidationStock }
  | { kind: "ordinary"; category: ForcedLiquidationCategory };

/** Cover the same URL/session sources as the shared authenticated fetch; invalid viewAs also denies access. */
export function isForcedLiquidationReadonlyView(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has("viewAs") || window.sessionStorage.getItem("view-as-user-id") !== null
      || params.get("readonly") === "true" || params.get("readonly") === "1";
  } catch { return true; }
}

export function canAccessForcedLiquidationSettings(input: {
  ledgerId: number;
  userId?: number;
  ownerId?: number;
  userRole?: string;
  isViewingAs: boolean;
}): boolean {
  return input.ledgerId === 37 && !input.isViewingAs && input.userRole === "owner"
    && Number.isInteger(input.userId) && Number(input.userId) > 0
    && Number.isInteger(input.ownerId) && Number(input.ownerId) > 0
    && input.userId === input.ownerId;
}

/** Only map persisted opening-order fields. No quote, counted price, or transaction editing is fabricated. */
export function forcedLiquidationStockOrder(stock: ForcedLiquidationStock): EditableStockBuyOrder {
  return {
    lotId: stock.lotId, eventId: stock.eventId, stockName: stock.stockName, symbol: stock.symbol,
    quantity: stock.quantity, executionPrice: stock.executionPrice, actualTradedAt: stock.actualTradedAt,
    note: stock.note, currentDownsideRule: stock.currentDownsideRule,
  };
}

/** Lifecycle is global tag metadata, never inferred from a disabled rule, member pause, or empty holdings. */
export function forcedLiquidationLifecycle(category: ForcedLiquidationCategory) {
  if (category.lifecycleStatus === "paused") return { status: "paused", label: "已暂停", rowClassName: "bg-gray-100 text-gray-700 hover:bg-gray-200" };
  if (category.lifecycleStatus === "ended") return { status: "ended", label: "已结束", rowClassName: "bg-[#E8EDF4] text-slate-600 hover:bg-[#DCE4EE]" };
  return { status: "active", label: "进行中", rowClassName: "bg-white text-gray-800 hover:bg-red-50" };
}

/** Paused and ended tags share one bottom bucket; preserve the server order within both buckets. */
export function sortForcedLiquidationCategories(categories: ForcedLiquidationCategory[]): ForcedLiquidationCategory[] {
  return categories.map((category, index) => ({ category, index })).sort((a, b) => {
    const aInactive = a.category.lifecycleStatus === "paused" || a.category.lifecycleStatus === "ended";
    const bInactive = b.category.lifecycleStatus === "paused" || b.category.lifecycleStatus === "ended";
    return Number(aInactive) - Number(bInactive) || a.index - b.index;
  }).map(({ category }) => category);
}

export function filterForcedLiquidationCategories(categories: ForcedLiquidationCategory[], search: string, enabledOnly: boolean): ForcedLiquidationCategory[] {
  const keyword = search.trim().toLocaleLowerCase();
  const matches = (value: string) => value.toLocaleLowerCase().includes(keyword);
  return sortForcedLiquidationCategories(categories.flatMap(category => {
    const tagMatches = !keyword || matches(category.categoryName);
    if (category.accountingMode === "manual_balance") {
      return tagMatches && (!enabledOnly || category.ordinaryRule?.enabled) ? [category] : [];
    }
    const stocks = category.stocks.filter(stock => stock.remainingQuantity > 0 && (!enabledOnly || stock.currentDownsideRule?.enabled)
      && (tagMatches || matches(stock.stockName) || matches(stock.symbol) || matches(stock.positionNumber ?? "") || matches(String(stock.lotId))));
    return stocks.length || (tagMatches && !enabledOnly) ? [{ ...category, stocks }] : [];
  }));
}

/** Display identity is separate from the real symbol used by queries, rules, and order editing. */
export function forcedLiquidationStockLabel(stock: ForcedLiquidationStock): string {
  const instrument = parsePortfolioInstrument(stock.symbol);
  if (instrument?.market === "CRYPTO") return portfolioDisplaySymbol(stock.symbol);
  if (instrument?.market === "US") return instrument.symbol;
  if (/^[0-9]{6}\.(SH|SZ|BJ)$/i.test(stock.symbol.trim())) {
    const name = stock.stockName.replace(/[0-9]{6}(?:\.(?:SH|SZ|BJ))?/gi, "").replace(/^[\s·/|—-]+|[\s·/|—-]+$/g, "").trim();
    return /[\u3400-\u9fff]/.test(name) ? name : "名称待核验";
  }
  return stock.stockName.trim() || "名称待核验";
}

export function forcedLiquidationPositionLabel(stock: ForcedLiquidationStock): string {
  return stock.positionNumber?.trim() ? `持仓 ${stock.positionNumber.trim()}` : `批次 #${stock.lotId}`;
}

export function forcedLiquidationStockQuantity(stock: ForcedLiquidationStock, quantity: number | null | undefined = stock.remainingQuantity): string {
  if (quantity == null || !Number.isFinite(quantity)) return "待核验";
  const unit = parsePortfolioInstrument(stock.symbol)?.quantityUnit ?? "股";
  return `${quantity.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}${unit}`;
}

/** List-only saved DTO money: no label/unit, and missing evidence must never become a false zero. */
export function forcedLiquidationIneffectiveNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Resolve by persisted IDs against the latest list, never keep stale rule/holding snapshots after refresh. */
export function resolveForcedLiquidationSelection(selection: Selection | null, categories: ForcedLiquidationCategory[]): Selection | null {
  if (!selection) return null;
  const category = categories.find(category => category.categoryId === selection.category.categoryId);
  if (!category || category.accountingMode !== selection.category.accountingMode) return null;
  if (selection.kind === "ordinary") return { kind: "ordinary", category };
  const stock = category.stocks.find(stock => stock.lotId === selection.stock.lotId && stock.remainingQuantity > 0);
  return stock ? { kind: "stock", category, stock } : null;
}

export function validateOrdinaryTagDownsideDraft(enabled: boolean, threshold: string, percent: string, startDate: string): Omit<OrdinaryTagDownsideRule, "version"> | string {
  const thresholdAmount = Number(threshold), downsidePercent = Number(percent);
  if (!threshold.trim() || !Number.isFinite(thresholdAmount) || thresholdAmount <= 0) return "请输入大于0的账户金额门槛";
  if (thresholdAmount > 1_000_000_000_000) return "账户金额门槛不能超过1万亿元";
  if (!percent.trim() || !Number.isFinite(downsidePercent) || downsidePercent < 0 || downsidePercent > 100) return "剩余保证金比例须为0–100%";
  if (!isValidStockTagDownsideStartDate(startDate) || startDate < "1000-01-01") return "请选择有效的启用日期（YYYY-MM-DD，1000年起）";
  return { enabled, thresholdAmount, downsidePercent, startDate };
}

function AccessNotice({ message, ledgerId }: { message: string; ledgerId: number }) {
  const [, setLocation] = useLocation();
  return <div className="mx-auto flex min-h-screen max-w-[480px] flex-col items-center justify-center gap-4 bg-white px-6 text-center">
    <h1 className="text-lg font-semibold text-[#C62828]">强平设置</h1>
    <p role="status" className="text-sm text-gray-600">{message}</p>
    <Button variant="outline" onClick={() => setLocation(`/ledger/${Number.isInteger(ledgerId) && ledgerId > 0 ? ledgerId : 37}`)}>返回账本</Button>
  </div>;
}

export default function ForcedLiquidationSettings() {
  const params = useParams();
  const ledgerId = Number(params.id);
  const search = useSearch();
  const isViewingAs = isForcedLiquidationReadonlyView();
  const authQuery = trpc.auth.me.useQuery(undefined, { staleTime: 0, refetchOnMount: "always", retry: false });
  let storedViewAs = "unavailable";
  try { storedViewAs = window.sessionStorage.getItem("view-as-user-id") ?? ""; } catch { /* fail closed */ }
  if (ledgerId !== 37 || isViewingAs) return <AccessNotice ledgerId={ledgerId} message="仅37号账本实际创建人可设置；代看或只读视角不能进入。" />;
  if (authQuery.error) return <AccessNotice ledgerId={ledgerId} message="无法核验本人身份，请重新登录后再试。" />;
  if (authQuery.isPending || !authQuery.isFetchedAfterMount) return <AccessNotice ledgerId={ledgerId} message="正在核验本人身份…" />;
  if (!authQuery.data?.id) return <AccessNotice ledgerId={ledgerId} message="无法核验本人身份，请重新登录后再试。" />;
  // Actor and view changes remount the ledger check; old actor's shared getById cache cannot unlock this page.
  return <ForcedLiquidationOwnerGate key={`${ledgerId}:${authQuery.data.id}:${search}:${storedViewAs}`} userId={authQuery.data.id} ledgerId={ledgerId} />;
}

function ForcedLiquidationOwnerGate({ ledgerId, userId }: { ledgerId: number; userId: number }) {
  const isViewingAs = isForcedLiquidationReadonlyView();
  const ledgerQuery = trpc.ledger.getById.useQuery({ ledgerId }, {
    enabled: ledgerId === 37 && !isViewingAs && userId > 0,
    placeholderData: undefined, staleTime: 0, refetchOnMount: "always", retry: false,
  });
  const ledger = !ledgerQuery.error && ledgerQuery.isFetchedAfterMount && Number(ledgerQuery.data?.id) === ledgerId ? ledgerQuery.data : undefined;
  const canAccess = canAccessForcedLiquidationSettings({ ledgerId, userId, ownerId: ledger?.ownerId, userRole: ledger?.userRole, isViewingAs });
  if (isViewingAs) return <AccessNotice ledgerId={ledgerId} message="代看或只读视角不能进入强平设置。" />;
  if (ledgerQuery.error) return <AccessNotice ledgerId={ledgerId} message="账本权限核验失败，请返回后重试。" />;
  if (ledgerQuery.isPending || !ledgerQuery.isFetchedAfterMount) return <AccessNotice ledgerId={ledgerId} message="正在核验账本创建人权限…" />;
  if (!canAccess) return <AccessNotice ledgerId={ledgerId} message="仅37号账本实际创建人可设置，普通管理员不开放此权限。" />;
  // Non-owners never mount the list hook tree, not just a disabled button over sensitive list data.
  return <ForcedLiquidationSettingsList />;
}

function ForcedLiquidationSettingsList() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const isViewingAs = isForcedLiquidationReadonlyView();
  const query = trpc.ledger.getForcedLiquidationSettings.useQuery({ ledgerId: 37 }, {
    enabled: !isViewingAs, staleTime: 0, refetchOnWindowFocus: false, retry: false,
  });
  const data: ForcedLiquidationList | undefined = query.data;
  const canEdit = !isViewingAs && !query.error && data?.ledgerId === 37 && data.canEdit === true;
  const [search, setSearch] = useState("");
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pending, setPending] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);
  const [view, setView] = useState<"tags" | "users">("tags");
  const [userFocusCategoryId, setUserFocusCategoryId] = useState<number | null>(null);
  const categories = filterForcedLiquidationCategories(data?.categories ?? [], search, enabledOnly);
  // Keep a mounted in-flight draft stable; list and first-level rows always use current query data.
  const currentSelection = pending ? selection : resolveForcedLiquidationSelection(selection, data?.categories ?? []);
  // The original panels call onClose after confirmed success (stock may still report pending until its effect).
  const closeEditor = () => {
    setSelection(null);
    setPending(false);
    void utils.ledger.getForcedLiquidationSettings.invalidate({ ledgerId: 37 });
    void utils.ledger.getForcedLiquidationUserImpact.invalidate({ ledgerId: 37 });
    if (selection) void utils.ledger.getForcedLiquidationSettingDetail.invalidate({ ledgerId: 37, categoryId: selection.category.categoryId, ...(selection.kind === "stock" ? { lotId: selection.stock.lotId } : {}) });
  };
  const selectEditor = (next: Selection) => {
    if (!canEdit || pending || isForcedLiquidationReadonlyView()) return;
    const same = selection?.category.categoryId === next.category.categoryId && selection.kind === next.kind
      && (selection.kind !== "stock" || (next.kind === "stock" && selection.stock.lotId === next.stock.lotId));
    setExpandedCategoryId(next.kind === "stock" ? next.category.categoryId : null);
    setSelection(same ? null : next);
  };
  const toggleCategory = (category: ForcedLiquidationCategory) => {
    if (!canEdit || pending || isForcedLiquidationReadonlyView() || !category.stocks.length) return;
    setExpandedCategoryId(expandedCategoryId === category.categoryId ? null : category.categoryId);
    setSelection(null);
  };
  const renderDetail = (selected: Selection, rowKey: string, detailId: string, fullName: string) => <tr data-inline-detail={rowKey} className="border-t border-red-100 bg-white"><td colSpan={3} className="p-3">
    <section id={detailId} aria-label={`${fullName} · 强平详情与设置`} className="space-y-4">
      <div className="space-y-1">
        <h2 className="break-words text-sm font-semibold text-[#C62828]">{fullName}</h2>
        {selected.kind === "stock" && <p aria-label="持仓备注" className="whitespace-pre-wrap break-words text-xs leading-5 text-gray-600">{selected.stock.note || "无备注"}</p>}
      </div>
      <InlineDetail key={rowKey} selection={selected} canEdit={canEdit} isViewingAs={isViewingAs} />
      <div className="space-y-3 border-t border-red-100 pt-3">
        <h3 className="text-sm font-semibold text-gray-800">设置内容</h3>
        {selected.kind === "stock" ? <StockTagDownsideRulePanel key={rowKey} categoryId={selected.category.categoryId} order={forcedLiquidationStockOrder(selected.stock)} canEdit={canEdit} isViewingAs={isViewingAs} hideValuationSummary onPendingChange={setPending} onClose={closeEditor} />
          : <OrdinaryTagDownsideRuleForm key={`${selected.category.categoryId}:${selected.category.ordinaryRule?.version ?? 0}`} category={selected.category} canEdit={canEdit} isViewingAs={isViewingAs} onPendingChange={setPending} onClose={closeEditor} onReload={() => { void query.refetch(); void utils.ledger.getForcedLiquidationSettingDetail.invalidate({ ledgerId: 37, categoryId: selected.category.categoryId }); }} />}
      </div>
      <Button variant="outline" disabled={pending} className="h-8 w-full text-xs" onClick={() => {
        if (pending || !canEdit || isForcedLiquidationReadonlyView()) return;
        setUserFocusCategoryId(selected.category.categoryId);
        setSelection(null);
        setView("users");
      }}>查看 / 管理该标签的用户规则</Button>
    </section>
  </td></tr>;
  if (isViewingAs) return <AccessNotice ledgerId={37} message="代看或只读视角不能进入强平设置。" />;
  return <div className="mx-auto min-h-screen max-w-[480px] bg-[#FFF7F7] pb-8">
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-red-100 bg-white px-3">
      <button type="button" aria-label="返回设置" disabled={pending} onClick={() => { if (!pending) setLocation("/ledger/37/settings"); }} className="p-2"><ChevronLeft className="h-5 w-5 text-[#C62828]" /></button>
      <h1 className="text-base font-semibold text-[#C62828]">强平设置</h1>
      <span className="ml-auto text-xs text-gray-500">37号 · 创建人</span>
    </header>
    <main className="space-y-3 p-3">
      <div role="tablist" aria-label="强平管理维度" className="grid grid-cols-2 gap-2">
        {(["tags", "users"] as const).map(mode => <Button key={mode} role="tab" aria-selected={view === mode}
          variant="outline" disabled={pending} className={view === mode ? "border-red-200 bg-red-50 text-xs text-[#C62828]" : "bg-white text-xs"}
          onClick={() => { if (!pending) { setSelection(null); setUserFocusCategoryId(null); setView(mode); } }}>
          {mode === "tags" ? "标签设置" : "用户控制"}
        </Button>)}
      </div>
      {view === "users" && canEdit && <ForcedLiquidationUserControl initialCategoryId={userFocusCategoryId}
        onPendingChange={setPending} onSaved={() => { void utils.ledger.getForcedLiquidationSettings.invalidate({ ledgerId: 37 }); }} />}
      {view === "users" && !canEdit && <p role="status" className="text-xs text-gray-500">正在核验创建人权限…</p>}
      {view === "tags" && <>
      <p className="text-xs leading-5 text-gray-600">列表金额统一折算为人民币；股票标签合计其下所有已开启持仓的金额。股票先展开持仓，再点击查看原币详情与设置；普通标签点击整行设置。规则与原逐股入口同步，已暂停、已结束标签置底。</p>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input aria-label="搜索标签名、股票名、编号或代码" placeholder="标签 / 股票 / 编号 / 代码" value={search} disabled={pending} onChange={event => { if (!pending) { setSearch(event.target.value); setSelection(null); } }} className="bg-white pl-9" /></div>
        <Button variant="outline" aria-label="只看开启强平" aria-pressed={enabledOnly} disabled={pending} onClick={() => { if (!pending) { setEnabledOnly(value => !value); setSelection(null); } }} className={enabledOnly ? "border-red-200 bg-red-50 px-3 text-xs text-[#C62828]" : "bg-white px-3 text-xs"}>只看开启</Button>
      </div>
      {query.isPending && <p role="status" className="p-4 text-center text-sm text-gray-500">正在读取标签规则…</p>}
      {query.error && <div role="alert" className="rounded-lg bg-white p-3 text-sm text-[#C62828]">读取失败：{query.error.message}<Button variant="outline" className="mt-2 w-full" onClick={() => void query.refetch()}>重试</Button></div>}
      {!query.isPending && !query.error && !canEdit && <p role="alert" className="p-3 text-sm text-[#C62828]">无法确认创建人编辑权限，不展示规则。</p>}
      {canEdit && <div className="overflow-hidden rounded-lg border border-red-100">
        <table aria-label="标签股票强平设置列表" className="w-full table-fixed border-collapse text-xs">
          <colgroup><col className="w-[48%]" /><col className="w-[29%]" /><col className="w-[23%]" /></colgroup>
          <thead className="bg-red-50 text-[#C62828]"><tr><th scope="col" className="px-2 py-2 text-left font-medium">标签 / 股票</th><th scope="col" className="px-2 py-2 text-left font-medium">强平</th><th scope="col" className="px-2 py-2 text-left font-medium">状态</th></tr></thead>
          <tbody>{categories.map(category => {
            const lifecycle = forcedLiquidationLifecycle(category);
            const isStock = category.accountingMode === "stock_portfolio";
            const fullCategory = data?.categories.find(item => item.categoryId === category.categoryId);
            const allActiveStocks = (fullCategory?.stocks ?? []).filter(stock => stock.remainingQuantity > 0);
            const enabledCount = allActiveStocks.filter(stock => stock.currentDownsideRule?.enabled === true).length;
            // Stock summaries share the full-query scope of enabledCount, never the searched/filtered lots.
            const summaryCategory = isStock ? fullCategory : category;
            const categoryIneffectiveNumber = forcedLiquidationIneffectiveNumber(summaryCategory?.ineffectiveFundsCny);
            const editable = !isStock || category.stocks.length > 0;
            const enabled = isStock ? enabledCount > 0 : category.ordinaryRule?.enabled === true;
            const categoryExpanded = isStock ? expandedCategoryId === category.categoryId : currentSelection?.kind === "ordinary" && currentSelection.category.categoryId === category.categoryId;
            const rowKey = `${category.categoryId}:tag`;
            const detailId = `forced-liquidation-detail-${category.categoryId}-tag`;
            const toggle = () => { if (isStock) toggleCategory(category); else selectEditor({ kind: "ordinary", category }); };
            return <Fragment key={rowKey}>
                <tr data-category-id={category.categoryId} data-lifecycle-status={lifecycle.status} onClick={toggle} className={`border-t border-red-100 ${editable && !pending ? "cursor-pointer" : ""} ${lifecycle.rowClassName}`}>
                  <td className="min-w-0"><button type="button" title={category.categoryName} aria-label={`${category.categoryName} · ${isStock ? editable ? "展开持仓" : "暂无持仓" : "设置强平"}`} aria-expanded={categoryExpanded} aria-controls={isStock ? `forced-liquidation-lots-${category.categoryId}` : detailId} disabled={!editable || pending} onClick={event => { event.stopPropagation(); toggle(); }} className="block w-full min-w-0 px-2 py-2 text-left disabled:cursor-default">
                    <span className="block truncate font-medium">{category.categoryName}</span>
                    {isStock && !allActiveStocks.length && <span className="mt-0.5 block text-[11px] opacity-75">暂无持仓</span>}
                  </button></td>
                  <td className="whitespace-nowrap px-2 py-2 text-[11px]">
                    <span className={enabled ? "font-medium text-[#C62828]" : "text-gray-500"}>{enabled ? "已开启强平" : "未开启强平"}</span>
                    {enabled && <span data-ineffective-funds={rowKey} data-ineffective-currency="CNY" title={categoryIneffectiveNumber === "—" ? "无效金额人民币折算待核验" : "无效金额 · CNY"} className="mt-0.5 block tabular-nums text-[#C62828]">{categoryIneffectiveNumber}</span>}
                    {isStock && <span className="mt-0.5 block text-[10px] text-gray-500">已开启 {enabledCount}/{allActiveStocks.length}</span>}
                  </td>
                  <td title={category.lifecycleDate ? `${lifecycle.label} · ${category.lifecycleDate}` : lifecycle.label} className="px-2 py-2 text-[11px]"><span className="flex items-center justify-between gap-1 whitespace-nowrap">{lifecycle.label}{editable && <ChevronDown aria-hidden="true" className={`h-3 w-3 shrink-0 transition-transform ${categoryExpanded ? "rotate-180" : ""}`} />}</span></td>
                </tr>
                {!isStock && categoryExpanded && currentSelection && renderDetail(currentSelection, rowKey, detailId, category.categoryName)}
                {isStock && categoryExpanded && category.stocks.map((stock, index) => {
                  const lotKey = `${category.categoryId}:${stock.lotId}`;
                  const lotDetailId = `forced-liquidation-detail-${category.categoryId}-${stock.lotId}`;
                  const name = forcedLiquidationStockLabel(stock);
                  const position = forcedLiquidationPositionLabel(stock);
                  const quantity = forcedLiquidationStockQuantity(stock);
                  const fullName = `${category.categoryName} · ${name} · ${position} · ${quantity}`;
                  const lotExpanded = currentSelection?.kind === "stock" && currentSelection.category.categoryId === category.categoryId && currentSelection.stock.lotId === stock.lotId;
                  const lotEnabled = stock.currentDownsideRule?.enabled === true;
                  const lotIneffectiveNumber = forcedLiquidationIneffectiveNumber(stock.ineffectiveFundsCny);
                  const toggleLot = () => selectEditor({ kind: "stock", category, stock });
                  return <Fragment key={lotKey}>
                    <tr id={index === 0 ? `forced-liquidation-lots-${category.categoryId}` : undefined} data-category-id={category.categoryId} data-lot-id={stock.lotId} data-lifecycle-status={lifecycle.status} onClick={toggleLot} className={`border-t border-red-100 ${!pending ? "cursor-pointer" : ""} ${lifecycle.rowClassName}`}>
                      <td className="min-w-0"><button type="button" title={fullName} aria-label={`${fullName} · 设置强平`} aria-expanded={lotExpanded} aria-controls={lotDetailId} disabled={pending} onClick={event => { event.stopPropagation(); toggleLot(); }} className="block w-full min-w-0 py-1.5 pl-5 pr-2 text-left disabled:cursor-default">
                        <span className="block truncate font-medium">{name} · {position}</span>
                        <span className="block text-[11px] opacity-75">{quantity}</span>
                        {stock.note && <span className="block truncate text-[11px] opacity-75">{stock.note}</span>}
                      </button></td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-[11px]">
                        <span className={lotEnabled ? "font-medium text-[#C62828]" : "text-gray-500"}>{lotEnabled ? "已开启强平" : "未开启强平"}</span>
                        {lotEnabled && <span data-ineffective-funds={lotKey} data-ineffective-currency="CNY" title={lotIneffectiveNumber === "—" ? "无效金额人民币折算待核验" : "无效金额 · CNY"} className="mt-0.5 block tabular-nums text-[#C62828]">{lotIneffectiveNumber}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-[11px]"><span className="flex items-center justify-between gap-1 whitespace-nowrap">{lifecycle.label}<ChevronDown aria-hidden="true" className={`h-3 w-3 shrink-0 transition-transform ${lotExpanded ? "rotate-180" : ""}`} /></span></td>
                    </tr>
                    {lotExpanded && currentSelection && renderDetail(currentSelection, lotKey, lotDetailId, fullName)}
                  </Fragment>;
                })}
              </Fragment>;
          })}</tbody>
        </table>
        </div>
      }
      {canEdit && !categories.length && <p className="p-4 text-center text-sm text-gray-500">{search || enabledOnly ? "没有匹配的标签或股票" : "暂无可设置标签"}</p>}
      </>}
    </main>
  </div>;
}

/** Null is missing evidence, not a zero balance. All values below come from the saved server DTO. */
export function forcedLiquidationDetailNumber(value: number | null | undefined, currency?: string): string {
  if (value == null || !Number.isFinite(value)) return "待核验";
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}${currency ? ` ${currency}` : ""}`;
}

/** The API uses signed drop percentages: a negative drop is a rise, never a negative decline. */
export function forcedLiquidationDetailDrop(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "待核验";
  return `${value < 0 ? "上涨" : "下跌"}${Math.abs(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%`;
}

/** Lazily mounted only inside the owner's single expanded row; never reuse another actor/lot's stale detail. */
function InlineDetail({ selection, canEdit, isViewingAs }: { selection: Selection; canEdit: boolean; isViewingAs: boolean }) {
  const categoryId = selection.category.categoryId;
  const lotId = selection.kind === "stock" ? selection.stock.lotId : null;
  const ownerEnabled = canEdit && !isViewingAs && !isForcedLiquidationReadonlyView()
    && Number.isInteger(categoryId) && categoryId > 0 && (lotId === null || (Number.isInteger(lotId) && lotId > 0));
  const query = trpc.ledger.getForcedLiquidationSettingDetail.useQuery({ ledgerId: 37, categoryId, ...(lotId === null ? {} : { lotId }) }, {
    enabled: ownerEnabled, placeholderData: undefined, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, retry: false,
  });
  const candidate: ForcedLiquidationSettingDetail | undefined = query.data;
  const detail = ownerEnabled && !query.error && query.isFetchedAfterMount && candidate?.ledgerId === 37
    && candidate.categoryId === categoryId && candidate.lotId === lotId && candidate.kind === selection.kind ? candidate : undefined;
  if (!ownerEnabled) return null;
  if (query.error) return <div role="alert" className="space-y-2 text-xs text-[#C62828]">详情读取失败，未展示旧缓存或未保存数据；请重试。<Button variant="outline" onClick={() => void query.refetch()}>重试详情</Button></div>;
  if (query.isPending || !query.isFetchedAfterMount) return <p role="status" className="text-xs text-gray-500">正在读取已保存详情…</p>;
  if (!detail) return <p role="status" className="text-xs text-gray-500">详情范围不匹配或缺少数据，待核验。</p>;
  const rule = detail.rule;
  const future = rule?.enabled && isValidStockTagDownsideStartDate(rule.startDate) && rule.startDate > beijingStockTagDownsideDate();
  const money = (value: number | null | undefined) => forcedLiquidationDetailNumber(value, detail.currency);
  const rows: [string, string][] = [
    ["当前强平规则", rule?.enabled ? future ? "已开启 · 尚未生效" : "已开启" : "未开启"],
    [detail.kind === "stock" ? "初始价" : "初始账户金额", money(detail.initialValue)],
    [detail.kind === "stock" ? "强平价" : "强平金额", rule ? money(rule.threshold) : "未设置"],
    ["从初始到门槛跌幅", forcedLiquidationDetailDrop(detail.initialToThresholdPercent)],
    [detail.kind === "stock" ? "最新价" : "最新账户金额", money(detail.latestValue)],
    ["从门槛到最新跌幅", forcedLiquidationDetailDrop(detail.thresholdToLatestPercent)],
    ["剩余保证金比例", rule ? `剩${forcedLiquidationDetailNumber(rule.downsidePercent)}%保证金` : "未设置"],
    ["有效资金", money(detail.effectiveFunds)],
    ["无效资金", money(detail.ineffectiveFunds)],
    ["原币种", detail.currency || "待核验"],
    ["最新数据日期", detail.latestDate ?? "待核验"],
    ["最新数据来源", detail.latestSource?.startsWith("ledger_records:") ? "日历余额登记" : detail.latestSource?.startsWith("ledger_stock_intraday_quotes:") ? "最新行情记录" : detail.latestSource?.startsWith("ledger_stock_price_snapshots:") ? "日结行情记录" : detail.latestSource ?? "待核验"],
    ["已保存启用日期", rule?.startDate ?? "未设置"],
  ];
  if (detail.kind === "stock" && selection.kind === "stock") rows.push([parsePortfolioInstrument(selection.stock.symbol)?.market === "CRYPTO" ? "剩余币数" : "剩余股数", detail.remainingQuantity == null ? "待核验" : forcedLiquidationStockQuantity(selection.stock, detail.remainingQuantity)]);
  if (detail.kind === "ordinary" && detail.fundBasis === "cashflow_neutral_replay") {
    rows.push(["本金净变动", money(detail.capitalChange)], ["取回", money(detail.withdraw)]);
  }
  return <div className="space-y-2" aria-label="已保存强平详情">
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden rounded-lg border border-red-100 text-xs">
      {rows.map(([label, value]) => <Fragment key={label}><dt className="border-b border-red-50 bg-red-50/50 px-2 py-2 text-gray-600">{label}</dt><dd className="min-w-0 break-words border-b border-red-50 px-2 py-2 font-medium text-gray-800">{value}</dd></Fragment>)}
    </dl>
    {detail.fundBasis === "cashflow_neutral_replay" && <p className="text-[11px] leading-5 text-gray-500">资金口径：现金流中性历史重放，本金净变动与取回不作为收益；有效 / 无效资金由服务端核验，不按初始金额减门槛推算，不是钱包可用余额。</p>}
    {detail.fundBasis === "segmented_price_drop" && <p className="text-[11px] leading-5 text-gray-500">资金口径：分段价格变动。有效资金为门槛以上下跌金额全额，加上门槛以下下跌金额×剩余比例；无效资金为门槛以下未计入的部分，均按真实剩余股数计算。仅展示当前门槛的两段金额，不改旧规则历史收益，不是钱包可用余额。</p>}
    {(detail.notice || detail.status !== "ready" || rule?.baselineStatus === "pending") && <p role="status" className="rounded-lg bg-amber-50 px-2 py-2 text-xs leading-5 text-amber-800">{detail.notice ?? (detail.status === "no_data" ? "缺少历史数据，待核验；不以0代替。" : "数据或规则待生效 / 核验，不代表收益重算已完成。")}</p>}
    <p className="text-[11px] text-gray-500">以上为已保存规则与真实数据，下方试填不会改变展示。</p>
  </div>;
}

/** Ordinary tags use an account-amount basis; keep the form independent of stock native-price rules. */
function OrdinaryTagDownsideRuleForm({ category, canEdit, isViewingAs, onClose, onPendingChange, onReload }: {
  category: ForcedLiquidationCategory;
  canEdit: boolean;
  isViewingAs: boolean;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  onReload: () => void;
}) {
  const utils = trpc.useUtils();
  const savedRule = category.ordinaryRule;
  const [enabled, setEnabled] = useState(savedRule?.enabled ?? false);
  const [threshold, setThreshold] = useState(String(savedRule?.thresholdAmount ?? ""));
  const [percent, setPercent] = useState(String(savedRule?.downsidePercent ?? 20));
  const [startDate, setStartDate] = useState(savedRule?.startDate ?? beijingStockTagDownsideDate());
  const mutation = trpc.ledger.setOrdinaryTagDownsideRule.useMutation({
    onSuccess: () => {
      onPendingChange(false);
      toast.success("普通标签规则已保存；从启用日期起按账户金额门槛及剩余比例计入收益，不自动卖出或操作钱包。");
      void utils.ledger.getForcedLiquidationSettings.invalidate({ ledgerId: 37 });
      void utils.ledger.getForcedLiquidationSettingDetail.invalidate({ ledgerId: 37, categoryId: category.categoryId });
      void utils.ledger.getCategories.invalidate({ ledgerId: 37 });
      void utils.ledger.getCalendarData.invalidate({ ledgerId: 37 });
      // ledger has getReport, not getStats; partial input refreshes all cached years for ledger 37 only.
      void utils.ledger.getReport.invalidate({ ledgerId: 37 });
      void utils.ledger.getMyOrdinaryTagObservationOverview.invalidate({ ledgerId: 37 });
      void utils.ledger.getMyOrdinaryTagDownsideValuations.invalidate({ ledgerId: 37 });
      void utils.ledger.getTagSummary.invalidate({ ledgerId: 37, tagName: category.categoryName });
      void utils.ledger.getAllTagsMarginSummary.invalidate({ ledgerId: 37 });
      void utils.adminGetLedger37DividendAvailability.invalidate({ ledgerId: 37 });
      onClose();
    },
    onError: error => {
      onPendingChange(false);
      toast.error(`规则保存失败：${error.message}；请重新打开核对最新版本后再保存。`);
      onReload();
    },
  });
  const blocked = !canEdit || isViewingAs || mutation.isPending || import.meta.env.DEV;
  const percentLabel = percent.trim() && Number.isFinite(Number(percent)) && Number(percent) >= 0 && Number(percent) <= 100
    ? `剩${Number(percent)}%保证金` : "剩余保证金";
  const save = () => {
    if (blocked || isForcedLiquidationReadonlyView() || !Number.isInteger(category.categoryId) || category.categoryId <= 0) return;
    const draft = validateOrdinaryTagDownsideDraft(enabled, threshold, percent, startDate);
    if (typeof draft === "string") return toast.error(draft);
    const expectedVersion = savedRule?.version ?? 0;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return toast.error("规则版本无效，请重新读取后再保存");
    onPendingChange(true);
    mutation.mutate({ ledgerId: 37, categoryId: category.categoryId, ...draft, expectedVersion });
  };
  return <div className="space-y-3">
    <label className="flex items-center justify-between rounded-lg border border-red-100 px-3 py-2.5 text-sm"><span>启用普通标签规则</span><input type="checkbox" role="switch" aria-label="启用普通标签规则" aria-checked={enabled} checked={enabled} disabled={mutation.isPending} onChange={event => setEnabled(event.target.checked)} className="h-4 w-4 accent-[#C62828]" /></label>
    <div><Label htmlFor="ordinary-downside-threshold">账户金额门槛（CNY）</Label><Input id="ordinary-downside-threshold" type="number" inputMode="decimal" min="0" step="any" value={threshold} disabled={mutation.isPending} onChange={event => setThreshold(event.target.value)} className="mt-1" /></div>
    <div className="grid grid-cols-2 gap-3">
      <div><Label htmlFor="ordinary-downside-percent">{percentLabel}</Label><Input id="ordinary-downside-percent" type="number" inputMode="decimal" min="0" max="100" step="any" value={percent} disabled={mutation.isPending} onChange={event => setPercent(event.target.value)} className="mt-1" /></div>
      <div><Label htmlFor="ordinary-downside-start-date">启用日期</Label><Input id="ordinary-downside-start-date" type="date" value={startDate} disabled={mutation.isPending} onChange={event => setStartDate(event.target.value)} className="mt-1 min-w-0" /></div>
    </div>
    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-gray-600">账户金额低于门槛时，涨跌按剩余保证金比例计入；回升至门槛以上恢复全额。启用前不变，本金变动与取回不算收益。规则不改原登记金额，不自动卖出或操作钱包；缺历史证据时待核验。</p>
    {import.meta.env.DEV && <p role="status" className="text-xs text-[#C62828]">开发热预览仅展示和试填，禁用正式写入，不会假保存。</p>}
    <div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={mutation.isPending} onClick={() => { if (!mutation.isPending) onClose(); }}>取消</Button><Button className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]" disabled={blocked} onClick={save}>{mutation.isPending ? "保存中…" : "保存规则"}</Button></div>
  </div>;
}
