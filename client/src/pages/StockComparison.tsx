/** 股票指标对比：全量真实数据前端筛选，不执行数据库写操作。 */
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  AlertCircle,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  BarChart3,
  Check,
  ChevronDown,
  Search,
  Table2,
  X,
} from "lucide-react";
import AIStockNavigation from "@/components/AIStockNavigation";
import StockReturnRanking, { type StockReturnRankingHandle } from "@/components/StockReturnRanking";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { AI_STOCK_THEME } from "@/lib/ai-stock-theme";
import { getAShareCompletedCutoff } from "../../../shared/a-share-completed-days";
import { StockLifecyclePanel } from "./StockLifecycle";
import { aiStockDisplayName, aiStockNeedsDelistedBadge } from "@/lib/ai-stock-display-name";

type Period = "30" | "60" | "90" | "180" | "365" | "lifetime";
type StreakPeriod = Exclude<Period, "lifetime">;
type OrdinaryMetric = "upRate" | "downRate" | "upDays" | "downDays" | "totalDays";
type Metric = OrdinaryMetric | "streaks" | "returnPercent";
type Market = "all" | "SH" | "SZ" | "GEM" | "STAR" | "DELISTED";
type ComparisonItem = {
  tsCode: string;
  name: string;
  listStatus: string;
  market: "SH" | "SZ" | "GEM" | "STAR" | "OTHER";
  upDays: number;
  downDays: number;
  flatDays: number;
  totalDays: number;
  upRate: number;
  downRate: number;
  flatRate: number;
  lastTradeDate: string | null;
  updatedAt: string | null;
};
type ComparisonData = {
  period: Period;
  asOf: string | null;
  windowStart: string | null;
  windowTradingDays: number | null;
  generatedAt: string;
  source: "daily" | "lifecycle";
  items: ComparisonItem[];
};
type StreakItem = { tsCode: string; name: string; days: number };
type StreakData = {
  period: StreakPeriod;
  asOf: string | null;
  windowStart: string | null;
  windowTradingDays: number;
  fetchedAt: string;
  dataUpdatedAt: string | null;
  up: StreakItem[];
  down: StreakItem[];
};
type StreakQueryHandle = { refetch: () => void };

const RED = "#D32F2F";
const GREEN = "#15803D";
const PAGE_SIZE = 50;
// 其他指标先不展示；保留实现，后续按需要再接入横向下拉。
const SHOW_LEGACY_COMPARISON_METRICS = false;
const METRICS: { key: Metric; label: string }[] = [
  { key: "returnPercent", label: "区间涨跌幅" },
  { key: "upRate", label: "涨天率" },
  { key: "downRate", label: "跌天率" },
  { key: "totalDays", label: "交易日数" },
  { key: "upDays", label: "上涨天数" },
  { key: "downDays", label: "下跌天数" },
  { key: "streaks", label: "连续涨跌" },
];
const PERIODS: { key: Period; label: string }[] = [
  { key: "30", label: "近30日" },
  { key: "60", label: "近60日" },
  { key: "90", label: "近90日" },
  { key: "180", label: "近180日" },
  { key: "365", label: "近365日" },
  { key: "lifetime", label: "全生命周期" },
];
const MARKETS: { key: Market; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业板" },
  { key: "STAR", label: "科创板" },
  { key: "DELISTED", label: "退市" },
];

// 保留来源的日期，不通过 UTC 转换改变实际截止日。
function dateText(value: string | null | undefined) {
  if (!value) return "未提供";
  const match = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value;
}
function shanghaiTimeText(value: string | null | undefined) {
  if (!value) return "未提供";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未提供";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
function valueText(stock: ComparisonItem, metric: OrdinaryMetric) {
  return metric === "upRate" || metric === "downRate"
    ? `${stock[metric].toFixed(1)}%`
    : `${stock[metric].toLocaleString("zh-CN")}天`;
}
function colorFor(metric: OrdinaryMetric) {
  return metric === "upRate" || metric === "upDays"
    ? RED
    : metric === "downRate" || metric === "downDays"
      ? "#15803D"
      : "#64748B";
}
function trackFor(metric: OrdinaryMetric) {
  return metric === "upRate" || metric === "upDays"
    ? "#FCE7E5"
    : metric === "downRate" || metric === "downDays"
      ? "#E5F3EA"
      : "#EDF0F4";
}

// 仅在连续模式挂载，普通五维度不请求连续接口，也不从生命周期缓存推算连续段。
function StreakComparisonResults({
  period,
  market,
  keyword,
  queryRef,
  onFetchingChange,
  openStock,
}: {
  period: StreakPeriod;
  market: Market;
  keyword: string;
  queryRef: Ref<StreakQueryHandle>;
  onFetchingChange: (fetching: boolean) => void;
  openStock: (stock: Pick<ComparisonItem, "tsCode">) => void;
}) {
  const query = trpc.aiStockStreakComparison.useQuery(
    { period, market, keyword: keyword.trim() },
    { retry: 1, staleTime: 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true }
  );
  const data: StreakData | undefined = query.data;
  const refetch = query.refetch;
  const retry = () => { void refetch(); };

  useImperativeHandle(queryRef, () => ({ refetch: () => { void refetch(); } }), [refetch]);
  useEffect(() => {
    onFetchingChange(query.isFetching);
  }, [query.isFetching, onFetchingChange]);
  useEffect(() => () => onFetchingChange(false), [onFetchingChange]);

  useEffect(() => {
    let lastCutoff = getAShareCompletedCutoff();
    // 只重读后端数据库缓存，不采集报价；截止日变化不代表源行情已更新。
    const timer = window.setInterval(() => {
      const cutoff = getAShareCompletedCutoff();
      if (cutoff !== lastCutoff) {
        lastCutoff = cutoff;
        void refetch();
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  const lists = useMemo(() => {
    const ranked = (items: StreakItem[] | undefined) =>
      (Array.isArray(items) ? items : [])
        .filter(stock => stock && typeof stock.tsCode === "string" && stock.tsCode.length > 0 &&
          typeof stock.name === "string" && Number.isInteger(stock.days) && stock.days > 0)
        .slice()
        .sort((a, b) => b.days - a.days || a.tsCode.localeCompare(b.tsCode))
        .slice(0, 100);
    return { down: ranked(data?.down), up: ranked(data?.up) };
  }, [data]);
  const periodMismatch = !!data && data.period !== period;
  const malformed = !!data && (!Array.isArray(data.up) || !Array.isArray(data.down));
  const failed = !!query.error || periodMismatch || malformed;
  const ready = !!data && !failed;
  const dataUpdatedText = shanghaiTimeText(data?.dataUpdatedAt);
  const rowCount = Math.max(lists.down.length, lists.up.length);

  const stockCell = (stock: StreakItem | undefined, direction: "down" | "up") =>
    stock ? (
      <button
        type="button"
        onClick={() => openStock(stock)}
        aria-label={`查看${stock.name}，最长连续${direction === "down" ? "下跌" : "上涨"}${stock.days}天`}
        className="flex min-h-11 min-w-0 items-center justify-between gap-1 px-2.5 py-3 text-left hover:bg-[#E4F4F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#087987]"
        style={{ color: direction === "down" ? GREEN : RED }}
      >
        <span className="min-w-0 truncate text-xs font-medium" title={stock.name}>{stock.name}</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums">{stock.days}天</span>
      </button>
    ) : <div aria-hidden="true" className="min-h-11 min-w-0" />;

  return (
    <>
      <section
        aria-label="连续涨跌统计口径"
        className="space-y-1 rounded-xl border border-[#DCE7F0] bg-[#EAF2F7] px-3 py-2.5 text-[11px] leading-5 text-[#61758A]"
      >
        {ready && (
          <>
            <p className="font-medium text-[#142A3F]">
              行情截至：{data.asOf ? `${dateText(data.asOf)} 15:00（收盘）` : "未提供"}
            </p>
            {dataUpdatedText !== "未提供" && <p>数据更新：{dataUpdatedText}（北京时间）</p>}
            <p>实际窗口：{dateText(data.windowStart)} 至 {dateText(data.asOf)} · {data.windowTradingDays} 个交易日</p>
          </>
        )}
        <p>交易日收盘后更新；休市沿用上一交易日。仅统计15点后已完成的交易日。</p>
        <p>按所选周期内最长连续段排名，非当前尾段。平盘不计天且不打断；未知报价打断，无日线不补天。左右各仅展示前100只。</p>
      </section>

      <section aria-label="最长连续涨跌榜" className="overflow-hidden rounded-2xl border border-[#DCE7F0] bg-white shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-[#DCE7F0] border-b border-[#DCE7F0] bg-[#EAF2F7]">
          <h2 className="min-w-0 px-2.5 py-3 text-xs font-semibold" style={{ color: GREEN }}>最长连续下跌 <span className="text-[10px] font-normal">Top100</span></h2>
          <h2 className="min-w-0 px-2.5 py-3 text-xs font-semibold" style={{ color: RED }}>最长连续上涨 <span className="text-[10px] font-normal">Top100</span></h2>
        </div>
        {failed || (!data && !query.isFetching) ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-5 py-9 text-center">
            <AlertCircle className="h-7 w-7 text-[#D32F2F]" />
            <p className="text-sm font-medium">连续涨跌数据加载失败</p>
            <p className="text-xs leading-5 text-[#61758A]">
              {periodMismatch ? "返回的周期与所选周期不一致，请重试。" : malformed ? "数据格式暂不可用，请稍后重试。" : "暂时无法获取真实交易数据，请检查网络或稍后重试。"}
            </p>
            <button type="button" onClick={retry} disabled={query.isFetching} className="rounded-full bg-[#087987] px-5 py-2 text-xs text-white disabled:opacity-60">
              重试
            </button>
          </div>
        ) : !data ? (
          <div role="status" aria-label="正在获取连续涨跌数据" className="min-h-[144px] animate-pulse bg-[#EAF2F7]/50" />
        ) : rowCount === 0 ? (
          <div className="px-5 py-9 text-center">
            <p className="text-sm font-medium text-[#142A3F]">暂无符合条件的连续涨跌记录</p>
            <p className="mt-2 text-xs leading-5 text-[#61758A]">请调整周期、板块或搜索关键词。</p>
          </div>
        ) : (
          <div>
            {Array.from({ length: rowCount }, (_, index) => (
              <div key={index} className="grid grid-cols-2 divide-x divide-[#DCE7F0] border-b border-[#DCE7F0] last:border-b-0">
                {stockCell(lists.down[index], "down")}
                {stockCell(lists.up[index], "up")}
              </div>
            ))}
          </div>
        )}
      </section>
      <footer className="pb-5 text-center text-[10px] leading-5 text-[#61758A]">
        <p>日线数据 · 各榜天数降序，同分按股票代码排序。</p>
        <p>小提示：日线16:00起同步，数据未到仍保留上次排行。</p>
        <p>仅供指标比较，不构成投资建议。</p>
      </footer>
    </>
  );
}

function StockHorizontalComparison({
  homeMode = false,
  ref,
  onFetchingChange,
}: {
  homeMode?: boolean;
  ref?: Ref<{ refetch: () => void }>;
  onFetchingChange?: (fetching: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const routeLedgerId = Number(id);
  const ledgerId = !homeMode && Number.isInteger(routeLedgerId) && routeLedgerId > 0 ? routeLedgerId : undefined;
  const [selectedMetric, setMetric] = useState<Metric>("returnPercent");
  const [period, setPeriod] = useState<Period>("60");
  const [market, setMarket] = useState<Market>("all");
  const [keyword, setKeyword] = useState("");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [hideInsufficient, setHideInsufficient] = useState(true);
  const [view, setView] = useState<"bars" | "table">("bars");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [streakLifetimeFallback, setStreakLifetimeFallback] = useState(false);
  const [streakFetching, setStreakFetching] = useState(false);
  const streakQueryRef = useRef<StreakQueryHandle>(null);
  const [returnFetching, setReturnFetching] = useState(false);
  const returnQueryRef = useRef<StockReturnRankingHandle>(null);
  const isStreaks = selectedMetric === "streaks";
  const isReturns = selectedMetric === "returnPercent";
  const isOrdinary = !isStreaks && !isReturns;
  const metric: OrdinaryMetric = isStreaks || isReturns ? "upRate" : selectedMetric;
  const selectMetric = (nextMetric: Metric) => {
    if (nextMetric === "streaks" && !isStreaks) {
      setStreakLifetimeFallback(period === "lifetime");
      if (period === "lifetime") setPeriod("365");
    }
    setMetric(nextMetric);
  };

  // 不使用上一周期的 placeholderData，避免切换周期后展示错误时间口径。
  const query = trpc.aiStockComparison.useQuery(
    { period },
    { retry: 1, staleTime: 60_000, enabled: isOrdinary }
  );
  const data: ComparisonData | undefined = query.data;
  const recent = period !== "lifetime";
  const windowDays = data?.windowTradingDays;
  const knownWindow =
    typeof windowDays === "number" &&
    Number.isFinite(windowDays) &&
    windowDays > 0;
  const metricLabel = METRICS.find(item => item.key === metric)!.label;
  const metricColor = colorFor(metric);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedMetric, period, market, keyword, sortDirection, hideInsufficient]);

  const comparison = useMemo(() => {
    if (!isOrdinary) return { filtered: [], maximum: 0, missingCount: 0, candidateCount: 0 };
    const search = keyword.trim().toLocaleLowerCase();
    const items = Array.isArray(data?.items) ? data.items : [];
    const candidates = items.filter(stock => {
      // 全市场及所有板块均只展示 L；退市入口只展示 D，不混入暂停上市等状态。
      if (market === "DELISTED") {
        if (stock.listStatus !== "D") return false;
      } else {
        if (stock.listStatus !== "L") return false;
        if (market !== "all" && stock.market !== market) return false;
      }
      return (
        !search ||
        stock.name.toLocaleLowerCase().includes(search) ||
        stock.tsCode.toLocaleLowerCase().includes(search)
      );
    });
    const missing = (stock: ComparisonItem) =>
      !Number.isFinite(stock.totalDays) ||
      stock.totalDays <= 0 ||
      !Number.isFinite(stock[metric]) ||
      (recent && knownWindow && stock.totalDays < windowDays);
    const missingCount = candidates.filter(missing).length;
    // 零样本 / 非有限值不能形成可信指标，不管开关如何都不参与排名。
    const valid = candidates.filter(
      stock =>
        Number.isFinite(stock.totalDays) &&
        stock.totalDays > 0 &&
        Number.isFinite(stock[metric])
    );
    const filtered = valid.filter(
      stock => !recent || !hideInsufficient || !missing(stock)
    );
    filtered.sort((a, b) => {
      const delta = a[metric] - b[metric];
      return (
        (sortDirection === "desc" ? -delta : delta) ||
        a.tsCode.localeCompare(b.tsCode)
      );
    });
    // 用全量筛选结果计算同一比例尺，而不是当前展示的前 50 条。
    const maximum = filtered.reduce(
      (max, stock) => Math.max(max, Math.abs(stock[metric])),
      0
    );
    return {
      filtered,
      maximum,
      missingCount,
      candidateCount: candidates.length,
    };
  }, [
    isOrdinary,
    data,
    keyword,
    market,
    metric,
    recent,
    knownWindow,
    windowDays,
    hideInsufficient,
    sortDirection,
  ]);

  const visibleStocks = comparison.filtered.slice(0, visibleCount);
  const periodMismatch = !!data && data.period !== period;
  const malformed = !!data && !Array.isArray(data.items);
  const failed = !!query.error || periodMismatch || malformed;
  const ready = !!data && !failed;
  const limitedWindow =
    ready &&
    recent &&
    typeof windowDays === "number" &&
    windowDays < Number(period);
  const historical = data?.source === "lifecycle";
  const openStock = (stock: Pick<ComparisonItem, "tsCode">) =>
    setLocation(`/stock/${stock.tsCode.replace(/\./g, "-")}`);
  const retry = () => {
    if (isReturns) returnQueryRef.current?.refetch();
    else if (isStreaks) streakQueryRef.current?.refetch();
    else void query.refetch();
  };
  useImperativeHandle(ref, () => ({ refetch: retry }));
  const fetching = isReturns ? returnFetching : isStreaks ? streakFetching : query.isFetching;
  useEffect(() => {
    onFetchingChange?.(fetching);
  }, [fetching, onFetchingChange]);
  useEffect(() => () => onFetchingChange?.(false), [onFetchingChange]);

  const rowNotes = (stock: ComparisonItem) => {
    const insufficient = recent && knownWindow && stock.totalDays < windowDays;
    const staleTrade =
      !!data?.asOf &&
      !!stock.lastTradeDate &&
      dateText(stock.lastTradeDate) < dateText(data.asOf);
    return (
      <>
        {insufficient && !hideInsufficient && (
          <p className="mt-1 text-[11px] leading-4 text-amber-700">
            样本不足 · 实际 {stock.totalDays} / 窗口 {windowDays} 个交易日
          </p>
        )}
        {staleTrade && (
          <p className="mt-1 text-[11px] leading-4 text-[#61758A]">
            最近交易 {dateText(stock.lastTradeDate)} · 交易滞后（可能停牌）
          </p>
        )}
        {historical && (
          <p className="mt-1 text-[11px] leading-4 text-[#61758A]">
            更新：{dateText(stock.updatedAt)}
          </p>
        )}
      </>
    );
  };

  return (
    <div className="h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto" style={{ background: AI_STOCK_THEME.background, color: AI_STOCK_THEME.text }}>
        <main className="space-y-3 px-3 py-3">
          {(!isReturns || SHOW_LEGACY_COMPARISON_METRICS) && (
          <section
            aria-label="数据筛选"
            className="rounded-2xl border border-[#DCE7F0] bg-white p-3 shadow-sm"
          >
            {SHOW_LEGACY_COMPARISON_METRICS && <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">选择数据指标</h2>
              <span className="text-[11px] text-[#74869A]">
                一次只看一个维度
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {METRICS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={selectedMetric === item.key}
                  data-testid={`stock-comparison-metric-${item.key}`}
                  onClick={() => selectMetric(item.key)}
                  className="min-w-0 rounded-lg border px-1 py-2 text-xs font-medium transition-colors"
                  style={{
                    background: selectedMetric === item.key ? AI_STOCK_THEME.accentSoft : AI_STOCK_THEME.surface,
                    color: selectedMetric === item.key ? AI_STOCK_THEME.accent : AI_STOCK_THEME.muted,
                    borderColor: selectedMetric === item.key ? AI_STOCK_THEME.accent : AI_STOCK_THEME.border,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            </>}

            {!isReturns && <>
            <div className="mt-3 text-[11px] font-medium text-[#61758A]">
              比较周期
            </div>
            <div
              className={isStreaks ? "mt-1.5 grid grid-cols-5 gap-1 pb-1" : "mt-1.5 flex gap-1.5 overflow-x-auto pb-1"}
              aria-label="周期选项"
            >
              {PERIODS.filter(item => !isStreaks || item.key !== "lifetime").map(item => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={period === item.key}
                  onClick={() => { setPeriod(item.key); setStreakLifetimeFallback(false); }}
                  className={isStreaks ? "min-w-0 whitespace-nowrap rounded-full px-1 py-1.5 text-[11px] font-medium" : "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium"}
                  style={{
                    background: period === item.key ? AI_STOCK_THEME.accent : AI_STOCK_THEME.surface,
                    color: period === item.key ? "white" : AI_STOCK_THEME.muted,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {isStreaks && (
              <p role="status" className="mt-1 text-[11px] leading-5 text-amber-800">
                {streakLifetimeFallback ? "已从全生命周期切换为近365日；" : ""}
                全生命周期缓存无连续涨跌字段，此榜仅支持所选近期窗口，不代表全历史。
              </p>
            )}
            </>}

            {!isReturns && <>
            <div className="mt-2 text-[11px] font-medium text-[#61758A]">
              市场板块
            </div>
            <div
              className={!isOrdinary ? "mt-1.5 grid grid-cols-3 gap-1 pb-1" : "mt-1.5 flex gap-1 overflow-x-auto pb-1"}
              aria-label="市场选项"
            >
              {MARKETS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={market === item.key}
                  data-testid={`stock-comparison-market-${item.key}`}
                  onClick={() => setMarket(item.key)}
                  className={!isOrdinary ? "min-w-0 whitespace-nowrap rounded-lg px-1 py-1.5 text-xs" : "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs"}
                  style={{
                    background: market === item.key ? AI_STOCK_THEME.accentSoft : AI_STOCK_THEME.surface,
                    color: market === item.key ? AI_STOCK_THEME.accent : AI_STOCK_THEME.muted,
                    fontWeight: market === item.key ? 600 : 400,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            </>}

            <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#DCE7F0] bg-[#EAF2F7] px-3">
              <Search className="h-4 w-4 shrink-0 text-[#74869A]" />
              <input
                aria-label="搜索股票名称或代码"
                data-testid="stock-comparison-keyword"
                type="search"
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder="搜索股票名称或代码"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#74869A]"
              />
              {keyword && (
                <button
                  type="button"
                  aria-label="清空搜索"
                  onClick={() => setKeyword("")}
                  className="p-1 text-[#74869A]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {recent && isOrdinary && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#61758A]">
                <input
                  type="checkbox"
                  checked={hideInsufficient}
                  onChange={event => setHideInsufficient(event.target.checked)}
                  className="h-4 w-4 accent-[#087987]"
                />
                隐藏样本不足
                <span className="ml-auto text-[10px] text-[#74869A]">
                  按实际交易窗口
                </span>
              </label>
            )}
          </section>
          )}

          {isReturns ? (
            <StockReturnRanking
              ref={returnQueryRef}
              market={market}
              onMarketChange={setMarket}
              keyword={keyword}
              ledgerId={ledgerId}
              onFetchingChange={setReturnFetching}
              openStock={openStock}
            />
          ) : isStreaks ? (
            <StreakComparisonResults
              period={period === "lifetime" ? "365" : period}
              market={market}
              keyword={keyword}
              queryRef={streakQueryRef}
              onFetchingChange={setStreakFetching}
              openStock={openStock}
            />
          ) : (
          <>
          {ready && (
            <section
              aria-label="数据时间口径"
              className="space-y-1 rounded-xl border border-[#DCE7F0] bg-[#EAF2F7] px-3 py-2.5 text-[11px] leading-5 text-[#61758A]"
            >
              {historical ? (
                <p className="font-medium text-amber-800">
                  历史缓存，各股票更新日期可能不同
                </p>
              ) : (
                <p>
                  实际截止{" "}
                  <strong className="font-semibold text-[#142A3F]">
                    {dateText(data.asOf)}
                  </strong>{" "}
                  · 非盘中实时行情
                </p>
              )}
              {recent && (
                <p>
                  实际窗口：{dateText(data.windowStart)} 至{" "}
                  {dateText(data.asOf)} ·{" "}
                  {windowDays == null
                    ? "交易日数未提供"
                    : `${windowDays} 个交易日`}
                </p>
              )}
              {limitedWindow && (
                <p
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 font-semibold text-amber-800"
                  role="status"
                >
                  此源仅有 {windowDays} 个交易日，不足所选 {period}{" "}
                  日；本页按实际窗口比较，并非完整 {period} 日样本。
                </p>
              )}
              {recent && !knownWindow && (
                <p className="text-amber-700">
                  {windowDays === 0
                    ? "该周期尚无交易日样本。"
                    : "未提供有效交易窗口，无法判断完整样本；仅展示有交易样本的有效指标。"}
                </p>
              )}
              <p>
                {market === "DELISTED" ? "仅退市股票" : "仅上市股票，不含退市"}{" "}
                · 涨 / 跌天率以股票实际交易样本为分母
              </p>
            </section>
          )}

          <section
            aria-label="数据结果"
            className="overflow-hidden rounded-2xl border border-[#DCE7F0] bg-white shadow-sm"
          >
            <div className="border-b border-[#DCE7F0] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{metricLabel}排名</h2>
                <div
                  className="flex rounded-lg bg-[#EAF2F7] p-0.5"
                  aria-label="结果展示方式"
                >
                  <button
                    type="button"
                    aria-pressed={view === "bars"}
                    aria-label="条形视图"
                    onClick={() => setView("bars")}
                    className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] ${view === "bars" ? "bg-white text-[#087987] shadow-sm" : "text-[#61758A]"}`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    条形
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === "table"}
                    aria-label="表格视图"
                    onClick={() => setView("table")}
                    className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] ${view === "table" ? "bg-white text-[#087987] shadow-sm" : "text-[#61758A]"}`}
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    表格
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[#61758A]" aria-live="polite">
                  {ready ? (
                    <>
                      有效股票{" "}
                      <span className="font-semibold text-[#142A3F]">
                        {comparison.filtered.length.toLocaleString("zh-CN")}
                      </span>{" "}
                      · 缺样本 {comparison.missingCount.toLocaleString("zh-CN")}
                    </>
                  ) : (
                    null
                  )}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setSortDirection(value =>
                      value === "desc" ? "asc" : "desc"
                    )
                  }
                  className="flex items-center gap-1 rounded-full border border-[#DCE7F0] px-2.5 py-1.5 text-[11px] text-[#61758A]"
                  aria-label={`当前${sortDirection === "desc" ? "从高到低" : "从低到高"}，点击切换排序`}
                >
                  {sortDirection === "desc" ? (
                    <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpWideNarrow className="h-3.5 w-3.5" />
                  )}
                  {sortDirection === "desc" ? "从高到低" : "从低到高"}
                </button>
              </div>
              {ready && (
                <p className="mt-2 text-[10px] leading-4 text-[#74869A]">
                  缺样本数按当前板块与搜索统计，包含零样本 /
                  无效指标；零样本不参与排名。
                  {recent && knownWindow
                    ? ` 完整样本门槛：${windowDays} 个交易日。`
                    : ""}
                </p>
              )}
            </div>

            {failed ? (
              <div
                role="alert"
                className="flex flex-col items-center gap-3 px-5 py-9 text-center"
              >
                <AlertCircle className="h-7 w-7 text-[#D32F2F]" />
                <p className="text-sm font-medium">股票数据加载失败</p>
                <p className="text-xs leading-5 text-[#61758A]">
                  {periodMismatch
                    ? "返回的周期与所选周期不一致，请重试。"
                    : malformed
                      ? "数据格式暂不可用，请稍后重试。"
                      : "暂时无法获取真实交易数据，请检查网络或稍后重试。"}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  disabled={query.isFetching}
                  className="rounded-full bg-[#087987] px-5 py-2 text-xs text-white disabled:opacity-60"
                >
                  重试
                </button>
              </div>
            ) : !data ? (
              query.isFetching ? (
                <div role="status" aria-label="正在获取股票数据" className="min-h-[144px] animate-pulse bg-[#EAF2F7]/50" />
              ) : (
                <div
                  role="alert"
                  className="flex flex-col items-center gap-3 px-5 py-10 text-center text-[#61758A]"
                >
                  <AlertCircle className="h-6 w-6" />
                  <p className="text-sm">暂未获得股票数据</p>
                  <button type="button" onClick={retry} className="text-xs font-medium text-[#087987]">重试</button>
                </div>
              )
            ) : comparison.filtered.length === 0 ? (
              <div className="px-5 py-9 text-center">
                <p className="text-sm font-medium text-[#142A3F]">
                  暂无符合条件的有效股票
                </p>
                <p className="mt-2 text-xs leading-5 text-[#61758A]">
                  {comparison.candidateCount === 0
                    ? "请调整板块或搜索关键词；此周期也可能尚无真实数据。"
                    : "当前股票缺少交易样本，或已被“隐藏样本不足”过滤。"}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  disabled={query.isFetching}
                  className="mt-3 text-xs font-medium text-[#087987] disabled:opacity-60"
                >
                  重新获取数据
                </button>
              </div>
            ) : view === "bars" ? (
              <div>
                <div className="bg-[#EAF2F7] px-3 py-2 text-[10px] text-[#61758A]">
                  同一比例尺 · 全部筛选结果最大值{" "}
                  {valueText(
                    comparison.filtered.reduce((a, b) =>
                      Math.abs(a[metric]) >= Math.abs(b[metric]) ? a : b
                    ),
                    metric
                  )}
                </div>
                {visibleStocks.map((stock, index) => (
                  <button
                    key={stock.tsCode}
                    type="button"
                    onClick={() => openStock(stock)}
                    aria-label={`查看${stock.name} ${stock.tsCode}，排名${index + 1}，${metricLabel}${valueText(stock, metric)}`}
                    className="block w-full border-b border-[#DCE7F0] px-3 py-3 text-left transition-colors hover:bg-[#E4F4F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 min-w-6 shrink-0 items-center justify-center rounded-md bg-[#EAF2F7] px-1 text-[10px] font-semibold text-[#61758A]">
                        {index + 1}
                      </span>
                      <span className="min-w-0 truncate text-sm font-semibold">
                        {aiStockDisplayName(stock.name, stock.listStatus)}
                      </span>
                      <span className="shrink-0 text-[10px] text-[#74869A]">
                        {stock.tsCode}
                      </span>
                      {aiStockNeedsDelistedBadge(aiStockDisplayName(stock.name, stock.listStatus), stock.listStatus) && (
                        <span className="shrink-0 rounded bg-[#EAF2F7] px-1 text-[10px] text-[#61758A]">
                          退
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_76px] items-center gap-3">
                      <div
                        className="h-2.5 w-full overflow-hidden rounded-full"
                        style={{ background: trackFor(metric) }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${comparison.maximum > 0 ? (Math.abs(stock[metric]) / comparison.maximum) * 100 : 0}%`,
                            background: metricColor,
                          }}
                        />
                      </div>
                      <span
                        className="text-right text-sm font-semibold tabular-nums"
                        style={{ color: metricColor }}
                      >
                        {valueText(stock, metric)}
                      </span>
                    </div>
                    {rowNotes(stock)}
                  </button>
                ))}
              </div>
            ) : (
              <table className="w-full table-fixed border-collapse text-xs">
                <thead className="bg-[#EAF2F7] text-[11px] text-[#61758A]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      排名 / 股票
                    </th>
                    <th className="w-[82px] px-2 py-2 text-right font-medium">
                      {metricLabel}
                    </th>
                    <th className="w-[70px] px-3 py-2 text-right font-medium">
                      样本数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStocks.map((stock, index) => (
                    <tr
                      key={stock.tsCode}
                      className="border-t border-[#DCE7F0] align-top hover:bg-[#E4F4F6]"
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => openStock(stock)}
                          aria-label={`查看${stock.name} ${stock.tsCode}`}
                          className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
                        >
                          <span className="block truncate text-sm font-medium">
                            <span className="mr-1.5 text-[10px] text-[#74869A]">
                              {index + 1}
                            </span>
                            {aiStockDisplayName(stock.name, stock.listStatus)}
                          </span>
                          <span className="mt-1 block text-[10px] text-[#74869A]">
                            {stock.tsCode}
                            {aiStockNeedsDelistedBadge(aiStockDisplayName(stock.name, stock.listStatus), stock.listStatus) ? " · 退" : ""}
                          </span>
                          {rowNotes(stock)}
                        </button>
                      </td>
                      <td
                        className="px-2 py-3 text-right font-semibold tabular-nums"
                        style={{ color: metricColor }}
                      >
                        <button
                          type="button"
                          onClick={() => openStock(stock)}
                          aria-label={`查看${stock.name}`}
                          className="py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
                        >
                          {valueText(stock, metric)}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#61758A]">
                        <button
                          type="button"
                          onClick={() => openStock(stock)}
                          aria-label={`查看${stock.name}`}
                          className="py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
                        >
                          {stock.totalDays.toLocaleString("zh-CN")}天
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {ready && comparison.filtered.length > 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-[11px] text-[#74869A]">
                  已展示 {visibleStocks.length.toLocaleString("zh-CN")} /{" "}
                  {comparison.filtered.length.toLocaleString("zh-CN")} 只
                </p>
                {visibleCount < comparison.filtered.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
                    className="mt-2 rounded-full border border-[#DCE7F0] bg-[#E4F4F6] px-6 py-2 text-xs font-medium text-[#087987]"
                  >
                    加载更多 50 只
                  </button>
                )}
              </div>
            )}
          </section>

          <footer className="pb-5 text-center text-[10px] leading-5 text-[#61758A]">
            {ready && (
              <>
                <p>
                  {historical
                    ? "历史缓存，各股票更新日期可能不同；请查看行内更新日期。"
                    : `实际数据截止：${dateText(data.asOf)}，并非盘中实时排名。`}
                </p>
                <p>
                  数据源：{historical ? "生命周期缓存" : "日线数据"} ·
                  结果生成：
                  {data.generatedAt
                    ? data.generatedAt.replace("T", " ")
                    : "未提供"}
                </p>
              </>
            )}
            <p>
              仅供指标比较，不构成投资建议。平盘计入交易样本，涨天率 +
              跌天率不一定等于 100%。
            </p>
          </footer>
          </>
          )}
        </main>
    </div>
  );
}

export default function StockComparison({
  homeMode = false,
}: { homeMode?: boolean } = {}) {
  const { id: ledgerId } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const mode = searchParams.get("view") === "compare" ? "compare" : "stocks";
  const routeKeyword = searchParams.get("q") ?? "";
  const routeMarket = MARKETS.find(item => item.key === searchParams.get("market"))?.key ?? "all";
  const [headerSearch, setHeaderSearch] = useState(routeKeyword);
  const [selectedMarket, setSelectedMarket] = useState<Market>(routeMarket);
  const [marketOpen, setMarketOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const marketCountQuery = trpc.aiDashboardMarketCount.useQuery(undefined, { staleTime: 60_000 });
  const marketLabel = (market: typeof MARKETS[number]) => {
    const count = marketCountQuery.data?.[market.key];
    return `${market.label}（${typeof count === "number" ? count.toLocaleString("zh-CN") : "—"}）`;
  };
  const selectedMarketLabel = marketLabel(MARKETS.find(item => item.key === selectedMarket)!);
  const panelRef = useRef<{ refetch: () => void }>(null);
  const activeModeRef = useRef(mode);
  activeModeRef.current = mode;
  const [panelFetching, setPanelFetching] = useState({ mode, fetching: false });

  useEffect(() => {
    setHeaderSearch(routeKeyword);
  }, [routeKeyword]);

  useEffect(() => {
    setSelectedMarket(routeMarket);
  }, [routeMarket]);

  // 模式变化即视为未刷新；忽略已卸载面板的通知，避免覆盖新面板状态。
  const onFetchingChange = useCallback((fetching: boolean) => {
    if (activeModeRef.current === mode) setPanelFetching({ mode, fetching });
  }, [mode]);
  const selectMode = (nextMode: typeof mode) => {
    if (nextMode === mode) return;
    const params = new URLSearchParams(search);
    if (nextMode === "stocks") {
      params.set("view", "stocks");
      params.set("market", selectedMarket);
      setComparisonOpen(false);
    } else {
      params.set("view", "compare");
      setMarketOpen(false);
    }
    const queryString = params.toString();
    setLocation(`${location}${queryString ? `?${queryString}` : ""}`);
  };
  const selectMarket = (market: Market) => {
    setSelectedMarket(market);
    setMarketOpen(false);
    const params = new URLSearchParams(search);
    params.set("view", "stocks");
    params.set("market", market);
    const queryString = params.toString();
    setLocation(`${location}${queryString ? `?${queryString}` : ""}`);
  };

  return (
    <div
      className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-[480px] flex-col overflow-hidden"
      style={{ background: AI_STOCK_THEME.background, color: AI_STOCK_THEME.text }}
    >
      <AIStockNavigation
        active="compare"
        ledgerId={ledgerId ?? 0}
        homeMode={homeMode}
        onBack={() => homeMode ? setLocation("/stock-tracker") : setLocation(`/ledger/${ledgerId}/ai-database`)}
        onRefresh={() => panelRef.current?.refetch()}
        isRefreshing={panelFetching.mode === mode && panelFetching.fetching}
        searchValue={headerSearch}
        onSearchChange={setHeaderSearch}
      />
      <div role="tablist" aria-label="数据展示方式" className="flex shrink-0 gap-1 border-b border-[#DCE7F0] px-3 py-1.5">
        <Popover open={marketOpen} onOpenChange={setMarketOpen}>
          <PopoverTrigger asChild>
            <button
              id="stock-data-tab-stocks"
              type="button"
              role="tab"
              aria-selected={mode === "stocks"}
              aria-controls="stock-data-panel"
              aria-label={`选择股票市场，当前${selectedMarketLabel}，点击展开市场选项`}
              onClick={() => selectMode("stocks")}
              className="flex min-w-0 flex-1 basis-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: mode === "stocks" ? AI_STOCK_THEME.accentSoft : "transparent",
                color: mode === "stocks" ? AI_STOCK_THEME.accent : AI_STOCK_THEME.muted,
                outlineColor: AI_STOCK_THEME.accent,
              }}
            >
              <span className="min-w-0 truncate">{selectedMarketLabel}</span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 border-[#DCE7F0] p-1">
            <div role="group" aria-label="选择纵向股票列表市场">
              {MARKETS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  aria-label={`选择${marketLabel(item)}`}
                  aria-pressed={selectedMarket === item.key}
                  onClick={() => selectMarket(item.key)}
                  className="flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset"
                  style={{
                    background: selectedMarket === item.key ? AI_STOCK_THEME.accentSoft : "transparent",
                    color: selectedMarket === item.key ? AI_STOCK_THEME.accent : AI_STOCK_THEME.muted,
                    outlineColor: AI_STOCK_THEME.accent,
                  }}
                >
                  <span>{marketLabel(item)}</span>
                  {selectedMarket === item.key && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={comparisonOpen} onOpenChange={setComparisonOpen}>
          <PopoverTrigger asChild>
            <button
              id="stock-data-tab-compare"
              type="button"
              role="tab"
              aria-selected={mode === "compare"}
              aria-controls="stock-data-panel"
              aria-label="选择横向比较指标，当前区间涨跌幅"
              onClick={() => selectMode("compare")}
              className="flex min-w-0 flex-1 basis-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: mode === "compare" ? AI_STOCK_THEME.accentSoft : "transparent",
                color: mode === "compare" ? AI_STOCK_THEME.accent : AI_STOCK_THEME.muted,
                outlineColor: AI_STOCK_THEME.accent,
              }}
            >
              <span className="min-w-0 truncate">区间涨跌幅</span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 border-[#DCE7F0] p-1">
            <div role="group" aria-label="横向比较指标" data-testid="stock-comparison-dropdown">
              <button
                type="button"
                data-testid="stock-comparison-option-returnPercent"
                aria-label="选择区间涨跌幅"
                aria-pressed={mode === "compare"}
                onClick={() => { setComparisonOpen(false); selectMode("compare"); }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset"
                style={{ background: AI_STOCK_THEME.accentSoft, color: AI_STOCK_THEME.accent, outlineColor: AI_STOCK_THEME.accent }}
              >
                <span>区间涨跌幅</span>
                {mode === "compare" && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div id="stock-data-panel" role="tabpanel" aria-labelledby={`stock-data-tab-${mode}`} className="min-h-0 flex-1 overflow-hidden">
        {mode === "stocks" ? (
          <StockLifecyclePanel homeMode={homeMode} keyword={headerSearch} market={selectedMarket} ref={panelRef} onFetchingChange={onFetchingChange} />
        ) : (
          <StockHorizontalComparison homeMode={homeMode} ref={panelRef} onFetchingChange={onFetchingChange} />
        )}
      </div>
    </div>
  );
}

export function StockTrackerComparison() {
  return <StockComparison homeMode />;
}
