import { Fragment, useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePortfolioInstrument, portfolioDisplaySymbol } from "@shared/portfolio-instruments";
import type {
  ForcedLiquidationUserOption,
  ForcedLiquidationUserImpact,
  ForcedLiquidationUserImpactCategory,
  ForcedLiquidationUserImpactLine,
} from "@shared/forced-liquidation-user-impact";

type UserMode = "follow_tag" | "exempt";
export type ForcedLiquidationUserControlProps = {
  initialCategoryId?: number | null;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: () => void;
};

/** Same fail-closed sources as the owner page/shared fetch; do not import the page back into its child. */
export function isForcedLiquidationUserReadonlyView(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has("viewAs") || window.sessionStorage.getItem("view-as-user-id") !== null
      || params.get("readonly") === "true" || params.get("readonly") === "1";
  } catch { return true; }
}

/** Cached data is never proof of a successful read for the newly selected real user. */
export function freshForcedLiquidationUserImpact(input: {
  data?: ForcedLiquidationUserImpact;
  targetUserId: number;
  isFetchedAfterMount: boolean;
  hasError: boolean;
  isViewingAs: boolean;
  refreshing: boolean;
}): ForcedLiquidationUserImpact | undefined {
  const { data, targetUserId, isFetchedAfterMount, hasError, isViewingAs, refreshing } = input;
  return !isViewingAs && !refreshing && !hasError && isFetchedAfterMount
    && Number.isSafeInteger(targetUserId) && targetUserId > 0
    && data?.ledgerId === 37 && data.targetUserId === targetUserId && data.canEdit === true
    && data.basis === "member_raw_minus_counted" ? data : undefined;
}

/** Formatting only: keep signed raw-minus-counted DTO values; null is not zero. */
export function forcedLiquidationUserNumber(value: number | null | undefined, native = false): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "待核验";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("zh-CN", {
    minimumFractionDigits: native ? 0 : 2, maximumFractionDigits: native ? 8 : 2,
  })}`;
}

/** Totals ALWAYS use the complete server DTO. One pending line invalidates the whole total. */
export function forcedLiquidationUserTotal(data: ForcedLiquidationUserImpact): string {
  const incomplete = data.status !== "ready" || data.pendingCount > 0 || data.categories.some(category =>
    category.participationStatus === "pending" || category.status === "pending"
    || (category.participationStatus !== "none" && category.status !== "ready")
    || category.lines.some(line => line.status !== "ready"));
  return incomplete ? "待核验" : forcedLiquidationUserNumber(data.totalImpactCny);
}

/** Fail closed on legacy/malformed DTOs; scope and exclusions come only from the server. */
export function forcedLiquidationUserProfitScope(data: ForcedLiquidationUserImpact): "complete" | "verified_only" | null {
  if ((data.profitScope !== "complete" && data.profitScope !== "verified_only")
    || !Array.isArray(data.excludedProfitCategories)
    || !Number.isSafeInteger(data.profitPendingCount) || data.profitPendingCount < 0
    || typeof data.profitImpactMatchesTotal !== "boolean"
    || (data.verifiedProfitImpactCny !== null && (typeof data.verifiedProfitImpactCny !== "number" || !Number.isFinite(data.verifiedProfitImpactCny)))
    || data.excludedProfitCategories.some(category => !category || !Number.isSafeInteger(category.categoryId) || category.categoryId <= 0
      || typeof category.categoryName !== "string" || !category.categoryName.trim()
      || !Number.isSafeInteger(category.lineCount) || category.lineCount < 0 || typeof category.notice !== "string")
    || (data.profitScope === "complete" ? data.excludedProfitCategories.length !== 0 : data.excludedProfitCategories.length === 0)) return null;
  return data.profitScope;
}

/** Complete profit retains the pending gate; verified-only profit excludes whole tags, not individual lines. */
export function forcedLiquidationUserProfitTotal(data: ForcedLiquidationUserImpact, kind: "raw" | "counted"): string {
  const scope = forcedLiquidationUserProfitScope(data);
  if (!scope || (scope === "complete" && data.profitPendingCount !== 0)
    || typeof data.totalRawPnlCny !== "number" || !Number.isFinite(data.totalRawPnlCny)
    || typeof data.totalCountedPnlCny !== "number" || !Number.isFinite(data.totalCountedPnlCny)) return "待核验";
  return forcedLiquidationUserNumber(kind === "raw" ? data.totalRawPnlCny : data.totalCountedPnlCny);
}

export function filterForcedLiquidationUsers(users: ForcedLiquidationUserOption[], search: string): ForcedLiquidationUserOption[] {
  const keyword = search.trim().toLocaleLowerCase();
  return users.filter(user => Number.isSafeInteger(user.userId) && user.userId > 0 && (!keyword
    || user.displayName.toLocaleLowerCase().includes(keyword) || user.username.toLocaleLowerCase().includes(keyword)));
}

/** Filter visibility, never trim line evidence or mutate the complete DTO used by the total. */
export function filterForcedLiquidationUserCategories(categories: ForcedLiquidationUserImpactCategory[], search: string,
  participatedOnly: boolean, focusCategoryId: number | null): ForcedLiquidationUserImpactCategory[] {
  const keyword = search.trim().toLocaleLowerCase();
  return categories.filter(category => (focusCategoryId === null || category.categoryId === focusCategoryId)
    && (!participatedOnly || category.participationStatus !== "none")
    && (!keyword || category.categoryName.toLocaleLowerCase().includes(keyword)
      || category.lines.some(line => `${line.stockName ?? ""} ${line.symbol ?? ""}`.toLocaleLowerCase().includes(keyword))))
    .map((category, index) => ({ category, index }))
    .sort((a, b) => Number(a.category.lifecycleStatus !== "active") - Number(b.category.lifecycleStatus !== "active") || a.index - b.index)
    .map(item => item.category);
}

export function forcedLiquidationUserLineLabel(line: ForcedLiquidationUserImpactLine): string {
  if (line.kind === "ordinary") return "普通标签 · 本人收益";
  const instrument = parsePortfolioInstrument(line.symbol);
  if (instrument?.market === "CRYPTO") return portfolioDisplaySymbol(line.symbol);
  if (instrument?.market === "US") return instrument.symbol;
  const name = (line.stockName ?? "").replace(/[0-9]{6}(?:\.(?:SH|SZ|BJ))?/gi, "")
    .replace(/^[\s·/|—-]+|[\s·/|—-]+$/g, "").trim();
  return /[\u3400-\u9fff]/.test(name) ? name : "名称待核验";
}

export function forcedLiquidationUserQuantity(line: ForcedLiquidationUserImpactLine): string {
  if (line.quantity == null || !Number.isFinite(line.quantity) || line.quantity < 0) return "待核验";
  return `${line.quantity.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}${parsePortfolioInstrument(line.symbol)?.quantityUnit ?? "股"}`;
}

/** Explicit allowlist: actor/owner/viewAs/other auth fields must never leave the client. */
export function forcedLiquidationUserMutationPayload(targetUserId: number, categoryId: number, mode: UserMode, expectedVersion: number) {
  if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0 || !Number.isSafeInteger(categoryId) || categoryId <= 0
    || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER
    || (mode !== "follow_tag" && mode !== "exempt")) return null;
  return { ledgerId: 37 as const, categoryId, targetUserId, mode, expectedVersion };
}

/** Only the actual-owner gate mounts this component. A second readonly guard denies all sensitive reads. */
export default function ForcedLiquidationUserControl({ initialCategoryId = null, onPendingChange, onSaved }: ForcedLiquidationUserControlProps) {
  useSearch();
  const isViewingAs = isForcedLiquidationUserReadonlyView();
  const [userSearch, setUserSearch] = useState("");
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const pendingCallbackRef = useRef(onPendingChange);
  pendingCallbackRef.current = onPendingChange;
  const query = trpc.ledger.getForcedLiquidationUsers.useQuery({ ledgerId: 37 }, {
    enabled: !isViewingAs, placeholderData: undefined, staleTime: 0, refetchOnMount: "always",
    refetchOnWindowFocus: false, retry: false,
  });
  const userData = !isViewingAs && !query.error && query.isFetchedAfterMount && query.data?.ledgerId === 37 ? query.data : undefined;
  const users: ForcedLiquidationUserOption[] = userData?.users ?? [];
  const selectedUser = users.find(user => user.userId === targetUserId);
  const visibleUsers = filterForcedLiquidationUsers(users, userSearch);
  const options = selectedUser && !visibleUsers.some(user => user.userId === selectedUser.userId) ? [selectedUser, ...visibleUsers] : visibleUsers;
  const reportPending = (value: boolean) => {
    pendingRef.current = value;
    setPending(value);
    pendingCallbackRef.current?.(value);
  };
  // Cleanup is unmount-only: an inline parent callback changing identity must not unlock an in-flight save.
  useEffect(() => () => { pendingCallbackRef.current?.(false); }, []);
  if (isViewingAs) return <p role="alert" className="text-xs text-[#C62828]">代看或只读视角不能读取、保存用户控制。</p>;
  return <section aria-label="真实用户强平控制" className="min-w-0 space-y-3">
    <p className="text-xs leading-5 text-gray-600">用户×标签控制优先于标签规则，默认跟随标签；不受强平影响包含该标签所有批次、全部历史与累计收益。</p>
    {import.meta.env.DEV && <p role="status" className="rounded bg-red-50 p-2 text-xs text-[#C62828]">开发热预览为只读，可试填草稿；正式写入已禁用，不会假保存。</p>}
    <div className="space-y-2">
      <div className="relative min-w-0"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input aria-label="搜索真实用户姓名或账号" placeholder="姓名 / 账号" value={userSearch} disabled={pending || !userData} onChange={event => { if (!pendingRef.current) setUserSearch(event.target.value); }} className="min-w-0 bg-white pl-9" /></div>
      <label className="block text-xs text-gray-600">真实用户
        <select aria-label="选择真实用户" value={targetUserId ?? ""} disabled={pending || !userData} onChange={event => {
          if (pendingRef.current || isForcedLiquidationUserReadonlyView()) return;
          const value = Number(event.target.value);
          setTargetUserId(event.target.value && users.some(user => user.userId === value) ? value : null);
        }} className="mt-1 block h-10 w-full min-w-0 max-w-full rounded-md border border-red-100 bg-white px-2 text-sm text-gray-800 disabled:opacity-50">
          <option value="">请选择用户（未选择不读取统计）</option>
          {options.map(user => <option key={user.userId} value={user.userId}>{user.displayName || user.username} / {user.username}</option>)}
        </select>
      </label>
      {userData && !visibleUsers.length && <p className="text-xs text-gray-500">没有匹配的真实用户。</p>}
    </div>
    {query.error && <div role="alert" className="text-xs text-[#C62828]">用户名单读取失败，不展示旧缓存。<Button variant="outline" disabled={pending} onClick={() => { if (!pendingRef.current) void query.refetch(); }} className="ml-2 h-7 text-xs">重试</Button></div>}
    {!query.error && !userData && <p role="status" className="text-xs text-gray-500">正在核验真实用户名单…</p>}
    {selectedUser && <ForcedLiquidationUserImpactBody key={selectedUser.userId} targetUserId={selectedUser.userId} initialCategoryId={initialCategoryId} onPendingChange={reportPending} onSaved={onSaved} />}
    {userData && targetUserId === null && <p role="status" className="py-3 text-center text-xs text-gray-500">先选择一位真实用户，再查看已保存影响。</p>}
  </section>;
}

function ForcedLiquidationUserImpactBody({ targetUserId, initialCategoryId = null, onPendingChange, onSaved }: ForcedLiquidationUserControlProps & { targetUserId: number }) {
  const utils = trpc.useUtils();
  const isViewingAs = isForcedLiquidationUserReadonlyView();
  const [search, setSearch] = useState("");
  const [participatedOnly, setParticipatedOnly] = useState(true);
  const [focusCategoryId, setFocusCategoryId] = useState<number | null>(initialCategoryId);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(initialCategoryId);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(false);
  const query = trpc.ledger.getForcedLiquidationUserImpact.useQuery({ ledgerId: 37, targetUserId }, {
    enabled: !isViewingAs && Number.isSafeInteger(targetUserId) && targetUserId > 0,
    placeholderData: undefined, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, retry: false,
  });
  const data = freshForcedLiquidationUserImpact({ data: query.data, targetUserId, isFetchedAfterMount: query.isFetchedAfterMount,
    hasError: !!query.error, isViewingAs, refreshing });
  const setPending = (value: boolean) => { busyRef.current = value; setBusy(value); onPendingChange?.(value); };
  const refreshImpact = async () => {
    refreshRef.current = true;
    setRefreshing(true);
    try {
      await utils.ledger.getForcedLiquidationUserImpact.invalidate({ ledgerId: 37, targetUserId });
      const result = await query.refetch();
      const verified = freshForcedLiquidationUserImpact({ data: result.data, targetUserId, isFetchedAfterMount: true,
        hasError: !!result.error || !result.isSuccess, isViewingAs: isForcedLiquidationUserReadonlyView(), refreshing: false });
      // A failed refetch keeps old DTO hidden, even when TanStack retains its cached data.
      if (verified) { refreshRef.current = false; setRefreshing(false); }
    } catch { toast.error("最新用户统计核验失败，请重试；未展示旧统计。"); }
  };
  const mutation = trpc.ledger.setUserTagDownsideOverride.useMutation({
    onSuccess: async () => {
      refreshRef.current = true;
      setRefreshing(true);
      // Full member-facing caches use ledger prefixes to cover every cached viewer/year.
      for (const name of ["getMyStockTagParticipantPortfolio", "getStockTagPublicPortfolio", "getStockTagDailySnapshots", "getStockTagCalendar"] as const) {
        void utils.ledger[name].invalidate({ ledgerId: 37 });
      }
      for (const name of ["getMyStockTagOverview", "getMyStockTagObservationOverview", "getMyOrdinaryTagObservationOverview", "getMyOrdinaryTagDownsideValuations", "getMyOrdinaryTagReturnValuations", "getMyR1AiParticipationPortfolio", "getMyLedger37AiOverview", "getMyLedger37AiStockPool", "getMyLedger37AiWalletValue", "getMyLedger37HoldingSources", "getCategories", "getCalendarData", "getReport", "getAllTagsMarginSummary"] as const) {
        void utils.ledger[name].invalidate({ ledgerId: 37 });
      }
      void utils.adminGetLedger37DividendAvailability.invalidate({ ledgerId: 37 });
      // The parent refreshes its global LIST through onSaved; this child never edits/invalidates global rules.
      try {
        onSaved?.();
        await refreshImpact();
        toast.success("用户标签控制已保存；历史及累计按已保存模式核验，不改钱包、已支付或原登记与成交。");
      } finally { setPending(false); }
    },
    onError: async error => {
      refreshRef.current = true;
      setRefreshing(true);
      toast.error(`保存失败：${error.message}；正在重读最新版本，请核验后重新试填。`);
      try { await refreshImpact(); } finally { setPending(false); }
    },
  });
  const pending = busy || mutation.isPending;
  const canEdit = data?.canEdit === true && !isViewingAs;
  useEffect(() => {
    if (busyRef.current) return;
    setFocusCategoryId(initialCategoryId);
    setExpandedCategoryId(initialCategoryId);
    // Jumping from a global tag may target an unparticipated category; do not hide the requested row.
    if (initialCategoryId !== null) setParticipatedOnly(false);
  }, [initialCategoryId]);
  const save = (categoryId: number, mode: UserMode) => {
    if (import.meta.env.DEV || !canEdit || isViewingAs || pending || busyRef.current || refreshRef.current
      || isForcedLiquidationUserReadonlyView()) return;
    const row = data?.categories.find(category => category.categoryId === categoryId);
    if (!row || row.override.mode === mode) return;
    const payload = forcedLiquidationUserMutationPayload(targetUserId, row.categoryId, mode, row.override.version);
    if (!payload) return toast.error("用户范围或保存版本无效，请刷新后再保存。");
    setPending(true);
    mutation.mutate(payload);
  };
  const visibleCategories = filterForcedLiquidationUserCategories(data?.categories ?? [], search, participatedOnly, focusCategoryId);
  if (isViewingAs) return <p role="alert" className="text-xs text-[#C62828]">代看或只读视角不能读取、保存用户控制。</p>;
  if (!data) return <div className="space-y-2 text-xs text-gray-500">
    <p role={query.error ? "alert" : "status"}>{query.error ? "用户影响读取失败，旧统计不作为最新结果。" : refreshing ? "正在重新核验已保存影响，旧统计已隐藏…" : "正在读取此用户的最新已保存影响…"}</p>
    {(query.error || refreshing || query.isFetchedAfterMount) && <Button variant="outline" disabled={pending} className="h-8 text-xs" onClick={() => {
      if (busyRef.current || isForcedLiquidationUserReadonlyView()) return;
      setPending(true);
      void refreshImpact().finally(() => setPending(false));
    }}>重新核验</Button>}
  </div>;
  const rawTotal = forcedLiquidationUserProfitTotal(data, "raw");
  const countedTotal = forcedLiquidationUserProfitTotal(data, "counted");
  const impactTotal = forcedLiquidationUserTotal(data);
  const profitScope = forcedLiquidationUserProfitScope(data);
  const verifiedOnly = profitScope === "verified_only";
  const profitMatchesTotal = profitScope !== null && data.profitImpactMatchesTotal === true
    && rawTotal !== "待核验" && countedTotal !== "待核验" && impactTotal !== "待核验"
    && typeof data.verifiedProfitImpactCny === "number" && Number.isFinite(data.verifiedProfitImpactCny);
  return <div className="min-w-0 space-y-2">
    <div data-user-profit-scope={profitScope ?? "pending"} data-profit-impact-matches-total={data.profitImpactMatchesTotal === true ? "true" : "false"} className="rounded-lg border border-red-100 bg-white px-3 py-2">
      <h3 className="min-w-0 break-words text-xs font-medium">{data.displayName} · {verifiedOnly ? "已核验标签获利" : profitScope === "complete" ? "全部标签" : "获利范围待核验"}</h3>
      <dl className="mt-1 space-y-1 text-xs">
        <div className="flex items-baseline justify-between gap-2"><dt className="min-w-0 break-words">{verifiedOnly ? "已核验标签 · " : ""}不受强平影响时获利</dt><dd className="shrink-0 text-right tabular-nums"><strong data-user-profit="raw">{rawTotal}{rawTotal !== "待核验" ? " 元" : ""}</strong></dd></div>
        <div className="flex items-baseline justify-between gap-2"><dt className="min-w-0 break-words">{verifiedOnly ? "已核验标签 · " : ""}当前设置下获利</dt><dd className="shrink-0 text-right tabular-nums"><strong data-user-profit="counted">{countedTotal}{countedTotal !== "待核验" ? " 元" : ""}</strong></dd></div>
        <div className="flex items-baseline justify-between gap-2"><dt className="min-w-0 break-words">全部标签影响总计</dt><dd className="shrink-0 text-right tabular-nums text-[#C62828]"><strong data-user-total="CNY">{impactTotal}{impactTotal !== "待核验" ? " 元" : ""}</strong></dd></div>
      </dl>
      {verifiedOnly && <div data-user-profit-excluded="true" className="mt-1 min-w-0 space-y-1 break-words text-[11px] leading-4 text-amber-700" aria-label="获利未包含标签">
        <p>未包含：{data.excludedProfitCategories.map(category => category.categoryName).join("、")}（整标签排除）</p>
        {data.excludedProfitCategories.map(category => <p key={category.categoryId} role="status" className="break-words">{category.categoryName}：{category.notice || "获利证据待核验，此标签未包含在前两项获利中。"}</p>)}
      </div>}
      <p className="mt-1 break-words text-[11px] leading-4 text-gray-500">{profitMatchesTotal
        ? `${verifiedOnly ? "已核验标签：" : ""}不受影响时获利 − 当前设置下获利 = 影响总计（服务端已核验与全部标签一致）`
        : verifiedOnly ? "前两项获利差额只对应已核验标签，不代表全部标签影响总计。"
          : "获利差额与全部标签影响总计尚未核验为一致；影响总计独立展示。"}</p>
      {verifiedOnly && <p className="mt-1 break-words text-[10px] leading-4 text-gray-500">已核验标签获利差额（服务端）：{forcedLiquidationUserNumber(data.verifiedProfitImpactCny)}{typeof data.verifiedProfitImpactCny === "number" && Number.isFinite(data.verifiedProfitImpactCny) ? " 元" : ""}</p>}
      <p className="mt-1 text-[11px] leading-4 text-gray-500">当前设置按已保存用户×标签控制及标签规则核算，不改真实规则开关。正数=强平少计，负数=相对原口径多计；不是全局当前分段金额或钱包余额。</p>
      <p className="mt-1 break-words text-[10px] text-gray-400">已保存统计 · {data.asOf || "日期待核验"}；筛选及草稿不改变总计。</p>
      {data.notice && <p role="status" className="mt-1 break-words text-[11px] text-amber-700">{data.notice}</p>}
    </div>
    <div className="flex min-w-0 gap-2"><Input aria-label="搜索用户标签或资产" placeholder="标签 / 股票 / 代码" value={search} disabled={pending} onChange={event => { if (!busyRef.current) setSearch(event.target.value); }} className="min-w-0 flex-1 bg-white text-xs" /><Button variant="outline" aria-pressed={participatedOnly} disabled={pending} className={`shrink-0 px-2 text-xs ${participatedOnly ? "border-red-200 bg-red-50 text-[#C62828]" : "bg-white"}`} onClick={() => { if (!busyRef.current) setParticipatedOnly(value => !value); }}>只看已参与</Button></div>
    {focusCategoryId !== null && <div className="flex items-center justify-between gap-2 rounded bg-red-50 px-2 py-1 text-xs text-[#C62828]"><span className="min-w-0 truncate">只看跳转标签：{data.categories.find(category => category.categoryId === focusCategoryId)?.categoryName ?? `#${focusCategoryId}`}</span><button type="button" disabled={pending} onClick={() => { if (!busyRef.current) setFocusCategoryId(null); }} className="shrink-0 px-1 py-1 underline">显示全部</button></div>}
    <div className="min-w-0 overflow-hidden rounded-lg border border-red-100">
      <table aria-label="本人各标签强平影响及控制" className="w-full table-fixed border-collapse text-xs">
        <colgroup><col className="w-[40%]" /><col className="w-[29%]" /><col className="w-[31%]" /></colgroup>
        <thead className="bg-red-50 text-[#C62828]"><tr><th scope="col" className="px-2 py-2 text-left font-medium">标签</th><th scope="col" className="px-2 py-2 text-left font-medium">影响（元）</th><th scope="col" className="px-2 py-2 text-left font-medium">用户控制</th></tr></thead>
        <tbody>{visibleCategories.map(category => {
          const expanded = expandedCategoryId === category.categoryId;
          const detailId = `user-impact-${targetUserId}-${category.categoryId}`;
          const toggle = () => { if (!busyRef.current && !pending) setExpandedCategoryId(expanded ? null : category.categoryId); };
          const lifecycle = category.lifecycleStatus === "paused" ? "已暂停" : category.lifecycleStatus === "ended" ? "已结束" : "进行中";
          return <Fragment key={category.categoryId}>
            <tr data-user-category={category.categoryId} onClick={toggle} className={`border-t border-red-100 ${category.lifecycleStatus === "paused" ? "bg-gray-100" : category.lifecycleStatus === "ended" ? "bg-[#E8EDF4]" : "bg-white"}`}>
              <td className="min-w-0"><button type="button" aria-expanded={expanded} aria-controls={detailId} aria-label={`${category.categoryName} · 展开本人明细和控制`} disabled={pending} onClick={event => { event.stopPropagation(); toggle(); }} className="block w-full min-w-0 px-2 py-2 text-left"><span className="block truncate font-medium" title={category.categoryName}>{category.categoryName}</span><span className="mt-0.5 block text-[10px] text-gray-500">{category.participationStatus === "none" ? "未参与" : category.participationStatus === "pending" ? "参与待核验" : "已参与"} · {lifecycle}</span></button></td>
              <td data-user-impact="CNY" className="break-words px-2 py-2 tabular-nums text-[#C62828]">{category.status === "ready" ? forcedLiquidationUserNumber(category.ineffectiveFundsCny) : category.participationStatus === "none" ? "未参与" : "待核验"}</td>
              <td className="px-2 py-2"><span className="flex items-center justify-between gap-1"><span className="min-w-0 break-words text-[11px]">{category.override.mode === "exempt" ? "不受强平影响" : "跟随标签"}</span><ChevronDown aria-hidden="true" className={`h-3 w-3 shrink-0 ${expanded ? "rotate-180" : ""}`} /></span><span className="mt-0.5 block text-[10px] text-gray-500">标签强平{category.globalEnabled ? "开启" : "关闭"}</span></td>
            </tr>
            {expanded && <tr data-user-inline-detail={category.categoryId} className="border-t border-red-100 bg-white"><td colSpan={3} className="min-w-0 p-2"><section id={detailId} aria-label={`${category.categoryName} · 本人明细和控制`} className="min-w-0 space-y-2">
              <ForcedLiquidationUserLines category={category} />
              <ForcedLiquidationUserModeDraft key={`${targetUserId}:${category.categoryId}:${category.override.version}:${category.override.mode}`} category={category} pending={pending} canEdit={canEdit} isViewingAs={isViewingAs} onSave={mode => save(category.categoryId, mode)} />
            </section></td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    {!visibleCategories.length && <p className="py-3 text-center text-xs text-gray-500">没有匹配标签；可取消“只看已参与”或标签筛选查看全部。</p>}
  </div>;
}

function ForcedLiquidationUserLines({ category }: { category: ForcedLiquidationUserImpactCategory }) {
  if (category.participationStatus === "none") return <p className="text-xs text-gray-500">未参与此标签，无本人收益记录；不伪造收益。</p>;
  return <div className="min-w-0 space-y-2" aria-label="本人的每笔影响">
    {category.lines.map((line, index) => <div key={`${line.participationId ?? "ordinary"}:${line.lotId ?? "none"}:${index}`} data-user-line={line.kind} className="min-w-0 border-b border-red-50 pb-2 last:border-b-0">
      <p className="break-words text-xs font-medium text-gray-800">{forcedLiquidationUserLineLabel(line)}{line.kind === "stock" && line.lotId !== null ? ` · 批次 #${line.lotId}` : ""}</p>
      <p className="mt-0.5 break-words text-[11px] text-gray-500">{line.kind === "stock" ? `本人实际持有 ${forcedLiquidationUserQuantity(line)} · ` : ""}参与日 {line.entryDate ?? "待核验"} · 数据日 {line.latestDate ?? "待核验"}</p>
      <dl className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
        <dt className="text-gray-500">原始累计收益 raw</dt><dd className="min-w-0 break-words tabular-nums">{forcedLiquidationUserNumber(line.rawPnl, true)} {line.currency}</dd>
        <dt className="text-gray-500">计入累计收益</dt><dd className="min-w-0 break-words tabular-nums">{forcedLiquidationUserNumber(line.countedPnl, true)} {line.currency}</dd>
        <dt className="text-gray-500">差额 raw − 计入</dt><dd className="min-w-0 break-words tabular-nums text-[#C62828]">{line.status === "ready" ? forcedLiquidationUserNumber(line.ineffectiveFunds, true) : "待核验"} {line.currency}</dd>
        <dt className="text-gray-500">人民币影响</dt><dd className="min-w-0 break-words tabular-nums text-[#C62828]">{line.status === "ready" ? forcedLiquidationUserNumber(line.ineffectiveFundsCny) : "待核验"} 元</dd>
      </dl>
      {(line.notice || line.status !== "ready") && <p role="status" className="mt-1 break-words text-[11px] text-amber-700">{line.notice || "此笔证据待核验，不按0计入总计。"}</p>}
    </div>)}
    {!category.lines.length && <p role="status" className="text-xs text-gray-500">本人明细待核验，不以0替代。</p>}
    {category.notice && <p role="status" className="break-words text-[11px] text-amber-700">{category.notice}</p>}
  </div>;
}

function ForcedLiquidationUserModeDraft({ category, pending, canEdit, isViewingAs, onSave }: {
  category: ForcedLiquidationUserImpactCategory;
  pending: boolean;
  canEdit: boolean;
  isViewingAs: boolean;
  onSave: (mode: UserMode) => void;
}) {
  const [mode, setMode] = useState<UserMode>(category.override.mode);
  const changed = mode !== category.override.mode;
  const blocked = pending || !canEdit || isViewingAs || import.meta.env.DEV;
  return <div className="min-w-0 space-y-2 border-t border-red-100 pt-2">
    <p className="text-[11px] text-gray-500">已保存：{category.override.mode === "exempt" ? "不受强平影响" : "跟随标签"} · v{category.override.version}；下方为草稿</p>
    <div role="group" aria-label={`${category.categoryName} 用户强平模式草稿`} className="grid grid-cols-2 gap-2">
      {(["follow_tag", "exempt"] as const).map(value => <Button key={value} variant="outline" aria-pressed={mode === value} disabled={pending || !canEdit || isViewingAs} className={`h-auto min-h-8 min-w-0 whitespace-normal px-2 py-2 text-xs ${mode === value ? "border-red-200 bg-red-50 text-[#C62828]" : "bg-white"}`} onClick={() => { if (!pending && canEdit && !isViewingAs && !isForcedLiquidationUserReadonlyView()) setMode(value); }}>{value === "exempt" ? "不受强平影响" : "跟随标签"}</Button>)}
    </div>
    <p className="text-[11px] leading-4 text-gray-500">不受强平影响：此用户在该标签所有批次、全部历史及累计恢复正常原始收益（raw）。不改钱包、已支付、原登记或成交。</p>
    {changed && <p role="status" className="text-[11px] text-[#C62828]">草稿未保存，以上统计仍为已保存口径。</p>}
    <Button disabled={blocked || !changed} className="h-8 w-full bg-[#D32F2F] text-xs hover:bg-[#B71C1C]" onClick={() => {
      if (blocked || !changed || isForcedLiquidationUserReadonlyView()) return;
      onSave(mode);
    }}>{pending ? "保存并核验中…" : "保存此用户标签控制"}</Button>
  </div>;
}
