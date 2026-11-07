/**
 * StockLifecycle.tsx
 * 个股全生命周期涨跌天数列表
 * 路径: /ledger/:id/stock-lifecycle
 */
import { useState, useCallback, useRef, useEffect, useLayoutEffect, useImperativeHandle } from "react";
import type * as React from "react";
import { Redirect, useParams, useLocation, useSearch } from "wouter";
import { SlidersHorizontal, Star } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { keepPreviousData } from "@tanstack/react-query";
import { AI_STOCK_THEME } from "@/lib/ai-stock-theme";
import { aiStockDisplayName, aiStockNeedsDelistedBadge } from "@/lib/ai-stock-display-name";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAIStockFavorites } from "@/hooks/useAIStockFavorites";
import { useVisibleStockQuotes, type StockLatestQuote } from "@/hooks/useVisibleStockQuotes";

// ─── 总天数筛选选项 ────────────────────────────────────────────────────────
const MIN_DAYS_OPTIONS: { label: string; value: number }[] = [
  { label: "不限", value: 0 },
  { label: "≥100天", value: 100 },
  { label: "≥200天", value: 200 },
  { label: "≥500天", value: 500 },
  { label: "≥1000天", value: 1000 },
  { label: "≥2000天", value: 2000 },
  { label: "≥3000天", value: 3000 },
];

// ─── 科技金融界面配色；行情红涨绿跌独立保留 ──────────────────────────────
const RED = AI_STOCK_THEME.rise;
const BG = AI_STOCK_THEME.background;
const CARD = AI_STOCK_THEME.card;
const BORDER = AI_STOCK_THEME.border;
const TEXT = AI_STOCK_THEME.text;
const MUTED = AI_STOCK_THEME.muted;
const ACCENT = AI_STOCK_THEME.accent;
const STOCK_GREEN = "#00B050";
const STOCK_FLAT = "#A1ADB8";

// ─── 板块 Tab 配置 ────────────────────────────────────────────────────────
type Market = "all" | "SH" | "SZ" | "GEM" | "STAR" | "DELISTED";

// ─── 排序列配置 ────────────────────────────────────────────────────────────
type SortBy = "code" | "up" | "down" | "flat" | "total";
type StatsSortOption = { key: Exclude<SortBy, "code">; label: string; shortLabel: string; color: string };
const TRADING_TOTAL_SORT: StatsSortOption = { key: "total", label: "交易天数", shortLabel: "交易天数", color: MUTED };
const STATS_SORT_OPTIONS: StatsSortOption[] = [
  { key: "up", label: "上涨天数", shortLabel: "上涨", color: RED },
  { key: "flat", label: "持平天数", shortLabel: "持平", color: MUTED },
  { key: "down", label: "下跌天数", shortLabel: "下跌", color: STOCK_GREEN },
];

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [20, 50, 100];
const MIN_STOCK_COLUMN_WIDTH = 62;
const FAVORITE_COLUMN_WIDTH = 36;
const PRICE_COLUMN_WIDTH = 62;
const TOTAL_DAYS_COLUMN_WIDTH = 48;
const TRADING_STATS_COLUMN_WIDTH = 156;
const COLUMN_COUNT = 5;
// 各列保留内容所需的基础宽度；表格铺满容器后均分剩余空间，不在收藏右侧留空。
const DATA_COLUMNS_WIDTH = TOTAL_DAYS_COLUMN_WIDTH + TRADING_STATS_COLUMN_WIDTH + PRICE_COLUMN_WIDTH + FAVORITE_COLUMN_WIDTH;
const COLUMN_LINE = "rgba(123,148,169,0.18)";

const normalizeSearchKeyword = (value: string) => value.trim().replace(/^(\d{6})[-.](SH|SZ|BJ)$/i, (_, code, exchange) => `${code}.${exchange.toUpperCase()}`);

type StockItem = {
  tsCode: string;
  name: string;
  listStatus: string;
  upDays: number;
  downDays: number;
  flatDays: number;
  totalDays: number;
  upRate: number;
};

export function StockLifecyclePanel({ keyword = "", market = "all", ref, onFetchingChange }: {
  homeMode?: boolean;
  keyword?: string;
  market?: Market;
  ref?: React.Ref<{ refetch: () => void }>;
  onFetchingChange?: (fetching: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { favoriteCodes, toggleFavorite, ready: favoritesReady } = useAIStockFavorites(user?.id);
  const canFavorite = favoritesReady && !authLoading && Boolean(user);
  const handleFavorite = useCallback((tsCode: string) => {
    if (!toggleFavorite(tsCode)) toast.error("收藏未保存，请检查浏览器存储权限");
  }, [toggleFavorite]);

  const [debouncedKeyword, setDebouncedKeyword] = useState(() => normalizeSearchKeyword(keyword));
  const [sortBy, setSortBy] = useState<SortBy>("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [minTotalDays, setMinTotalDays] = useState(0);
  const [showDaysFilter, setShowDaysFilter] = useState(false);

  // 每页按所选数量独立显示；条数、市场、搜索和排序改变后回到第一页。
  const listKey = `${market}|${debouncedKeyword}|${sortBy}|${sortDir}|${minTotalDays}|${pageSize}`;
  const listKeyRef = useRef(listKey);
  const [allItems, setAllItems] = useState<StockItem[]>([]);
  const [total, setTotal] = useState(0);
  // 筛选刚改变时立即查询第一页，不让旧页码的数据写入新列表。
  const queryPage = listKeyRef.current === listKey ? page : 1;

  const tableRef = useRef<HTMLTableElement>(null);
  const [stockColumnWidth, setStockColumnWidth] = useState(MIN_STOCK_COLUMN_WIDTH);
  // 使用页面实际字体测量当前页最长名称，不把所有股票列统一放宽。
  // 翻页出现较长简称时同步扩展整个colgroup，表头和数据始终共用列宽。
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      const fontFamily = getComputedStyle(table).fontFamily;
      let width = MIN_STOCK_COLUMN_WIDTH;
      for (const stock of allItems) {
        const name = aiStockDisplayName(stock.name, stock.listStatus);
        context.font = `500 13px ${fontFamily}`;
        let contentWidth = context.measureText(name).width;
        if (aiStockNeedsDelistedBadge(name, stock.listStatus)) {
          context.font = `400 9px ${fontFamily}`;
          contentWidth += context.measureText("退").width + 8 + 4;
        }
        context.font = `400 10px ${fontFamily}`;
        const codeWidth = context.measureText(stock.tsCode.replace(/\.(SH|SZ|BJ)$/i, "")).width;
        // 单元格左右各6px，额外1px防止字形小数宽度被裁切。
        width = Math.max(width, Math.ceil(Math.max(contentWidth, codeWidth)) + 13);
      }
      setStockColumnWidth(previous => previous === width ? previous : width);
    };
    measure();
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { active = false; document.fonts.removeEventListener("loadingdone", measure); };
  }, [allItems]);
  const tableWidth = stockColumnWidth + DATA_COLUMNS_WIDTH;

  // 当筛选条件变化时重置
  useEffect(() => {
    if (listKeyRef.current !== listKey) {
      listKeyRef.current = listKey;
      setAllItems([]);
      setTotal(0);
      setPage(1);
    }
  }, [listKey]);

  const { data, isFetching, isError, isSuccess, isPlaceholderData, refetch } = trpc.aiStockLifecycle.useQuery(
    { page: queryPage, pageSize, market, keyword: debouncedKeyword || undefined, sortBy, sortDir, minTotalDays },
    {
      placeholderData: keepPreviousData,
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 4000),
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      // 仅失败时恢复连接，成功后停止；不做后台行情轮询。
      refetchInterval: query => query.state.status === "error" ? 5000 : false,
      refetchIntervalInBackground: false,
    }
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const latestQuotes = useVisibleStockQuotes(scrollRef, tableRef, allItems.map(stock => stock.tsCode));
  // 表头只展示可见股票中最新一笔实际行情时间，不能把本次请求时间当报价时间。
  const headerQuote = Object.values(latestQuotes.quotes)
    .filter(quote => latestQuotes.requested.has(quote.tsCode) && quote.price != null && quote.tradeDate)
    .sort((a, b) => (b.quoteTime ?? b.tradeDate ?? "").localeCompare(a.quoteTime ?? a.tradeDate ?? ""))[0];
  const headerQuoteDate = headerQuote?.tradeDate ? `${Number(headerQuote.tradeDate.slice(5, 7))}月${Number(headerQuote.tradeDate.slice(8, 10))}日` : "—";
  const beijingToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  useImperativeHandle(ref, () => ({ refetch: () => { void refetch(); void latestQuotes.refetch(); } }), [refetch, latestQuotes.refetch]);

  useEffect(() => {
    onFetchingChange?.(isFetching || latestQuotes.isFetching);
  }, [isFetching, latestQuotes.isFetching, onFetchingChange]);

  // 当前页替换列表，不把各页累积到页面里，也不预取尚未打开的下一页。
  useEffect(() => {
    if (!data || isPlaceholderData || data.page !== queryPage) return;
    setTotal(data.total);
    setAllItems(data.list);
  }, [data, listKey, queryPage, isPlaceholderData]);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [listKey, queryPage]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageBusy = isFetching || (isPlaceholderData && !isError);
  const isEmpty = allItems.length === 0 && isSuccess && !isPlaceholderData && !isFetching
    && data?.page === queryPage && data.list.length === 0 && data.total === 0;

  const goToPage = (nextPage: number) => {
    if (pageBusy || nextPage < 1 || nextPage > totalPages || nextPage === queryPage) return;
    setAllItems([]);
    setPage(nextPage);
  };

  const changePageSize = (nextSize: number) => {
    if (pageBusy || !PAGE_SIZE_OPTIONS.includes(nextSize) || nextSize === pageSize) return;
    setAllItems([]);
    setPage(1);
    setPageSize(nextSize);
  };

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(normalizeSearchKeyword(keyword)), 400);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 排序标题双击/双点；单点不改变排序。
  const lastTouchRef = useRef<{ col: SortBy; at: number } | null>(null);
  const lastTouchSortAtRef = useRef(-Infinity);
  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir(d => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortDir(col === "code" ? "asc" : "desc");
    }
  };
  const handleSortDoubleTap = (event: React.PointerEvent<HTMLButtonElement>, col: SortBy) => {
    if (event.pointerType !== "touch") return;
    const now = performance.now();
    if (lastTouchRef.current?.col === col && now - lastTouchRef.current.at <= 350) {
      lastTouchRef.current = null;
      lastTouchSortAtRef.current = now;
      handleSort(col);
    } else {
      lastTouchRef.current = { col, at: now };
    }
  };
  const renderStatsSortButton = (col: StatsSortOption, primary = false) => (
      <button
        key={col.key}
        type="button"
        data-stock-sort={col.key}
        aria-label={`双击${col.label}排序`}
        title={`双击${col.label}切换升序或降序`}
        onPointerUp={event => handleSortDoubleTap(event, col.key)}
        onDoubleClick={() => { if (performance.now() - lastTouchSortAtRef.current > 500) handleSort(col.key); }}
        onKeyDown={event => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); handleSort(col.key); } }}
        className={`flex h-9 w-full select-none items-center justify-center ${primary ? "text-[11px]" : "text-[9px]"}`}
        style={{ touchAction: "manipulation", color: primary && sortBy === col.key ? ACCENT : col.color, fontWeight: sortBy === col.key ? 700 : 500 }}
      >
        {primary ? <span className="leading-[13px]"><span className="block">交易</span><span className="block">天数</span></span> : col.shortLabel}
      </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: BG }}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1 text-[9px]" style={{ color: MUTED }}>
        <span>{latestQuotes.isError ? "行情暂未连接，保留上次报价" : headerQuote?.tradeDate && headerQuote.tradeDate !== beijingToday ? `最近行情日期 ${headerQuote.tradeDate}` : "表头显示最新行情日期；较旧报价有标记"}</span>
        <span className="shrink-0">涨红 · 跌绿</span>
      </div>
      {/* 表头与数据共用 colgroup，滚动条与筛选图标不会改变列的位置。 */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto"
      >
        <table ref={tableRef} data-stock-data-table="true" aria-label="纵向股票数据" className="table-fixed border-separate border-spacing-0" style={{ width: "100%", minWidth: tableWidth, WebkitTextSizeAdjust: "100%", textSizeAdjust: "100%" }}>
          <colgroup>
            <col style={{ width: stockColumnWidth }} />
            <col style={{ width: TOTAL_DAYS_COLUMN_WIDTH }} />
            <col style={{ width: TRADING_STATS_COLUMN_WIDTH }} />
            <col style={{ width: PRICE_COLUMN_WIDTH }} />
            <col style={{ width: FAVORITE_COLUMN_WIDTH }} />
          </colgroup>
          <thead className="sticky top-0 z-20" style={{ background: AI_STOCK_THEME.surface, color: MUTED }}>
            <tr>
              <th scope="col" data-stock-column="name" aria-sort={sortBy === "code" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="relative px-1.5 text-left text-[11px] font-medium" style={{ borderBottom: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="双击股票代码排序"
                    title="双击股票切换代码升序或降序"
                    onPointerUp={event => handleSortDoubleTap(event, "code")}
                    onDoubleClick={() => { if (performance.now() - lastTouchSortAtRef.current > 500) handleSort("code"); }}
                    onKeyDown={event => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); handleSort("code"); } }}
                    className="flex h-9 select-none items-center text-left"
                    style={{ touchAction: "manipulation", color: sortBy === "code" ? ACCENT : MUTED, fontWeight: sortBy === "code" ? 700 : 500 }}
                  >股票</button>
                  <button type="button" aria-label="筛选总交易日数" aria-expanded={showDaysFilter} title="筛选总交易日数" onClick={() => setShowDaysFilter(v => !v)} className="flex h-8 w-7 items-center justify-center" style={{ color: minTotalDays > 0 ? ACCENT : MUTED }}>
                    <SlidersHorizontal className="h-3 w-3" />
                  </button>
                </div>
                {showDaysFilter && (
                  <div className="absolute left-0 top-full z-50 mt-0.5 min-w-[110px] rounded-xl py-1 text-left font-normal shadow-lg" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    {MIN_DAYS_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => { setMinTotalDays(opt.value); setShowDaysFilter(false); setPage(1); }} className="w-full px-4 py-2 text-left text-xs" style={{ color: minTotalDays === opt.value ? ACCENT : TEXT, fontWeight: minTotalDays === opt.value ? 700 : 400, background: minTotalDays === opt.value ? AI_STOCK_THEME.accentSoft : "transparent" }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </th>
              <th scope="col" data-stock-column="total" aria-sort={sortBy === "total" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="px-0.5 text-center" style={{ borderLeft: `1px solid ${COLUMN_LINE}`, borderBottom: `1px solid ${BORDER}` }}>
                {renderStatsSortButton(TRADING_TOTAL_SORT, true)}
              </th>
              <th scope="col" data-stock-column="tradingStats" aria-sort={sortBy !== "code" && sortBy !== "total" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="px-1.5 text-center" style={{ borderLeft: `1px solid ${COLUMN_LINE}`, borderBottom: `1px solid ${BORDER}` }} title="上涨、持平、下跌分布；红涨、灰平、绿跌。双击对应文字可排序">
                <div className="grid grid-cols-3">{STATS_SORT_OPTIONS.map(col => renderStatsSortButton(col))}</div>
              </th>
              <th scope="col" data-stock-column="price" className="p-0 text-center text-[11px] font-medium" style={{ borderLeft: `1px solid ${COLUMN_LINE}`, borderBottom: `1px solid ${BORDER}` }} title={`${headerQuote?.quoteTime ?? headerQuote?.tradeDate ?? "尚无有效报价时间"} · 本列最新有效行情；各股票的旧报价有标记，详细时间可查看提示`}>
                <span className="block leading-[14px]">最新价</span>
                <span data-stock-header-quote-date="true" className="block text-[8px] font-normal leading-3 tabular-nums">{headerQuoteDate}</span>
              </th>
              <th scope="col" data-stock-column="favorite" className="p-0 text-center text-[11px] font-medium" style={{ borderLeft: `1px solid ${COLUMN_LINE}`, borderBottom: `1px solid ${BORDER}` }}>收藏</th>
            </tr>
          </thead>
          <tbody>
            {isError && (
              <tr><td colSpan={COLUMN_COUNT} className={`${allItems.length === 0 ? "h-32" : "py-4"} text-center text-sm`} style={{ color: MUTED }}>
                <div role="status">数据暂未连接，正在重试</div>
                <button type="button" onClick={() => { void refetch(); }} className="mt-2 rounded px-3 py-1 text-xs" style={{ color: ACCENT, border: `1px solid ${BORDER}` }}>重试</button>
              </td></tr>
            )}
            {allItems.length === 0 && !isError && !isEmpty && (
              <tr><td colSpan={COLUMN_COUNT} className="h-32 text-center"><span aria-hidden="true" className="inline-block h-2 w-16 animate-pulse rounded-full" style={{ background: BORDER }} /></td></tr>
            )}
            {isEmpty && (
              <tr><td colSpan={COLUMN_COUNT} className="h-32 text-center text-sm" style={{ color: MUTED }}>暂无数据</td></tr>
            )}
            {allItems.map((stock, idx) => (
              <StockRow key={stock.tsCode} stock={stock} quote={latestQuotes.quotes[stock.tsCode]} latestQuoteDate={headerQuote?.tradeDate ?? undefined} quoteFailed={latestQuotes.isError && latestQuotes.requested.has(stock.tsCode)} idx={idx} sortBy={sortBy} isFavorite={favoriteCodes.has(stock.tsCode)} canFavorite={canFavorite} onFavorite={handleFavorite} onOpen={(tsCode) => setLocation(`/stock/${tsCode.replace(/\./g, '-')}`)} />
            ))}
            {isFetching && !isError && allItems.length > 0 && (
              <tr><td colSpan={COLUMN_COUNT} className="py-4 text-center"><span aria-hidden="true" className="inline-block h-2 w-16 animate-pulse rounded-full" style={{ background: BORDER }} /></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <nav aria-label="股票分页" data-stock-pagination="true" className="flex shrink-0 items-center justify-between gap-1.5 px-3 py-2" style={{ background: CARD, borderTop: `1px solid ${BORDER}` }}>
        <button type="button" data-stock-page-prev="true" onClick={() => goToPage(queryPage - 1)} disabled={pageBusy || queryPage <= 1} className="h-8 shrink-0 rounded-md px-2 text-[11px] disabled:opacity-35 active:opacity-70" style={{ color: ACCENT, border: `1px solid ${BORDER}` }}>上一页</button>
        <select aria-label="每页显示条数" title="选择每页显示的股票数量" data-stock-page-size="true" value={pageSize} disabled={pageBusy} onChange={event => changePageSize(Number(event.target.value))} className="h-8 shrink-0 rounded-md px-1 text-[10px] disabled:opacity-35" style={{ color: ACCENT, background: CARD, border: `1px solid ${BORDER}` }}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}条/页</option>)}
        </select>
        <div className="min-w-0 text-center tabular-nums" aria-live="polite">
          <div data-stock-page-label="true" className="text-[11px] font-medium" style={{ color: TEXT }}>第 {queryPage} / {total > 0 || isEmpty ? totalPages : "—"} 页</div>
          <div className="text-[8px] leading-3" style={{ color: MUTED }}>共 {total > 0 || isEmpty ? total.toLocaleString() : "—"} 只</div>
        </div>
        <button type="button" data-stock-page-next="true" onClick={() => goToPage(queryPage + 1)} disabled={pageBusy || isError || queryPage >= totalPages} className="h-8 shrink-0 rounded-md px-2 text-[11px] disabled:opacity-35 active:opacity-70" style={{ color: ACCENT, border: `1px solid ${BORDER}` }}>下一页</button>
      </nav>
    </div>
  );
}

// 兼容旧个股路由；搜索与分享参数完整保留，统一进入数据页的纵向列表。
export default function StockLifecycle({ homeMode = false }: { homeMode?: boolean }) {
  const { id: ledgerId } = useParams<{ id: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  params.set("view", "stocks");
  const basePath = homeMode ? "/stock-tracker/stock-compare" : `/ledger/${ledgerId}/stock-compare`;

  return <Redirect to={`${basePath}?${params.toString()}`} />;
}

// ─── 单行股票组件 ─────────────────────────────────────────────────────────
function StockRow({ stock, quote, latestQuoteDate, quoteFailed, idx, sortBy, onOpen, isFavorite, canFavorite, onFavorite }: { stock: StockItem; quote?: StockLatestQuote; latestQuoteDate?: string; quoteFailed: boolean; idx: number; sortBy: SortBy; onOpen: (tsCode: string) => void; isFavorite: boolean; canFavorite: boolean; onFavorite: (tsCode: string) => void }) {
  const displayName = aiStockDisplayName(stock.name, stock.listStatus);
  const showDelistedBadge = aiStockNeedsDelistedBadge(displayName, stock.listStatus);
  const pct = quote?.changePercent;
  const quoteColor = typeof pct === "number" && Number.isFinite(pct) ? (pct > 0 ? RED : pct < 0 ? STOCK_GREEN : TEXT) : MUTED;
  const quoteEpoch = quote?.quoteTime ? Date.parse(quote.quoteTime.replace(" ", "T") + "+08:00") : NaN;
  const isLive = quote?.status === "live" && !quoteFailed && Date.now() - quoteEpoch <= 120_000;
  const isOlderQuote = quote?.price != null && (quoteFailed || quote.status === "stale" || quote.status === "delayed" || (latestQuoteDate && quote.tradeDate && quote.tradeDate < latestQuoteDate));
  const quoteTitle = quote?.price != null ? `${quote.quoteTime ?? quote.tradeDate ?? "日期未提供"} · ${quote.source === "daily" ? "日线收盘缓存" : isLive ? "盘中最新行情" : "最近有效行情"}${quoteFailed ? " · 暂未更新" : ""}` : "暂未取得有效行情";
  const daySegments = [
    { key: "up", label: "上涨", count: stock.upDays, color: RED },
    { key: "flat", label: "持平", count: stock.flatDays, color: STOCK_FLAT },
    { key: "down", label: "下跌", count: stock.downDays, color: STOCK_GREEN },
  ].map(segment => ({ ...segment, percent: stock.totalDays > 0 ? segment.count / stock.totalDays * 100 : 0 }));
  const distributionLabel = `共${stock.totalDays.toLocaleString()}个交易日，${daySegments.map(segment => `${segment.label}${segment.count.toLocaleString()}天，占${stock.totalDays > 0 ? segment.percent.toFixed(1) + "%" : "—"}`).join("；")}`;

  return (
    <tr data-stock-grid-row={stock.tsCode} style={{ background: idx % 2 === 0 ? CARD : BG }}>
      {/* 股票名称 + 代码 */}
      <td data-stock-column="name" className="px-1.5 py-1.5 align-middle" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <button type="button" onClick={() => onOpen(stock.tsCode)} aria-label={`查看${displayName}的股票详情`} className="block w-full min-w-0 text-left active:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]">
        <div className="flex items-center gap-1">
          <span className="min-w-0 truncate text-[13px] font-medium" title={displayName} style={{ color: TEXT }}>
            {displayName}
          </span>
          {showDelistedBadge && (
            <span data-delisted-badge="true" className="shrink-0 rounded px-1 text-xs" style={{ background: AI_STOCK_THEME.surface, color: AI_STOCK_THEME.dim, fontSize: 9 }}>
              退
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[10px] tabular-nums" style={{ color: MUTED }}>{stock.tsCode.replace(/\.(SH|SZ|BJ)$/i, "")}</div>
        </button>
      </td>
      <td data-stock-column="total" className="px-0.5 py-1.5 text-center align-middle tabular-nums" style={{ borderLeft: `1px solid ${COLUMN_LINE}`, borderBottom: `1px solid ${BORDER}` }}>
        <span data-stock-total-days="true" className="block whitespace-nowrap text-[11px] leading-4" style={{ color: TEXT, fontWeight: sortBy === "total" ? 700 : 500 }}>{stock.totalDays.toLocaleString()}</span>
        <span data-stock-days-ratio="total" className="block text-[8px] leading-3" style={{ color: MUTED }}>{stock.totalDays > 0 ? "100%" : "—"}</span>
      </td>
      <td data-stock-column="tradingStats" className="px-1.5 py-1 align-middle tabular-nums" style={{ borderLeft: `1px solid ${COLUMN_LINE}`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-3 text-center">
          {daySegments.map(segment => <div key={segment.key} className="min-w-0" title={`${segment.label}${segment.count.toLocaleString()}天`}>
            <span data-stock-days-count={segment.key} className="block whitespace-nowrap text-[9px] leading-[11px]" style={{ color: segment.key === "flat" ? MUTED : segment.color, fontWeight: sortBy === segment.key ? 700 : 400 }}>{segment.count.toLocaleString()}</span>
            <span data-stock-days-ratio={segment.key} className="block text-[8px] leading-[10px]" style={{ color: MUTED }}>{stock.totalDays > 0 ? `${segment.percent.toFixed(1)}%` : "—"}</span>
          </div>)}
        </div>
        <div data-stock-days-distribution="true" role="img" aria-label={distributionLabel} title={distributionLabel} className="mt-0.5 flex h-[4px] w-full overflow-hidden rounded-full" style={{ background: BORDER }}>
          {daySegments.map(segment => <span key={segment.key} data-stock-days-segment={segment.key} aria-hidden="true" className="h-full shrink-0" style={{ width: `${segment.percent}%`, background: segment.color }} />)}
        </div>
      </td>
      <td data-stock-column="price" className="overflow-hidden px-0.5 py-1.5 text-center align-middle text-[11px] tabular-nums" style={{ color: quoteColor, borderLeft: `1px solid ${COLUMN_LINE}`, borderBottom: `1px solid ${BORDER}` }} title={quoteTitle}>
        <span className="flex items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap font-medium leading-4">{quote?.price != null && Number.isFinite(quote.price) ? quote.price.toFixed(2) : "—"}{isOlderQuote && <span className="text-[8px] font-normal" style={{ color: MUTED }} aria-label="较旧的有效报价">旧</span>}</span>
        <span data-stock-price-change="true" className="block overflow-hidden whitespace-nowrap text-[8px] font-normal leading-3">{typeof pct === "number" && Number.isFinite(pct) ? `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}</span>
      </td>
      <td data-stock-column="favorite" className="p-0 text-center align-middle" style={{ borderLeft: `1px solid ${COLUMN_LINE}`, borderBottom: `1px solid ${BORDER}` }}>
        <button
          type="button"
          data-stock-favorite={stock.tsCode}
          aria-label={`${isFavorite ? "取消收藏" : "收藏"}${displayName}`}
          aria-pressed={isFavorite}
          title={canFavorite ? (isFavorite ? "取消收藏" : "收藏到我的股票") : "登录后可收藏"}
          disabled={!canFavorite}
          onClick={event => { event.stopPropagation(); onFavorite(stock.tsCode); }}
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-md transition-colors active:opacity-70 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
          style={{ color: isFavorite ? "#C89A3D" : AI_STOCK_THEME.dim }}
        >
          <Star aria-hidden="true" className="h-4 w-4" strokeWidth={1.6} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </td>
    </tr>
  );
}

// 首页旧路由兼容：跳转到 /stock-tracker/stock-compare?view=stocks。
export function StockTrackerLifecycle() {
  return <StockLifecycle homeMode={true} />;
}
