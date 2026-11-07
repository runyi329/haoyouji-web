/** 区间累计涨跌幅：只读取真实日线排行，不采集报价或写入数据库。 */
import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { AlertCircle } from "lucide-react";
import AnimatedStockAILogo from "@/components/AnimatedStockAILogo";
import StockRankingImageDownload from "@/components/StockRankingImageDownload";
import { trpc } from "@/lib/trpc";
import { AI_STOCK_THEME } from "@/lib/ai-stock-theme";
import { aiStockDisplayName, aiStockNeedsDelistedBadge } from "@/lib/ai-stock-display-name";

type Market = "all" | "SH" | "SZ" | "GEM" | "STAR" | "DELISTED";
type Direction = "up" | "down";
type Period = "1w" | "1m" | "3m" | "6m" | "1y" | "3y" | "all";
type RankingInput = {
  period: Period;
  topN: number;
  market: Market;
  keyword?: string;
  ledgerId?: number;
};
type RankingItem = {
  tsCode: string;
  name: string;
  listStatus: string;
  returnPercent: number;
  sampleDays: number;
  firstTradeDate: string;
  lastTradeDate: string;
  firstPreClose: number;
  lastClose: number;
};
type RankingData = {
  days: number;
  topN: number;
  direction: Direction;
  market: Market;
  asOf: string | null;
  windowStart: string | null;
  windowTradingDays: number;
  completeWindow: boolean;
  eligibleCount: number;
  excludedCount: number;
  items: RankingItem[];
  dataUpdatedAt: string | null;
  fetchedAt: string;
  method: "daily-reference-compound";
  period?: Period;
  requestedStart: string | null;
  coverageNote: string | null;
};
export type StockReturnRankingHandle = { refetch: () => void };
type Props = {
  ref?: Ref<StockReturnRankingHandle>;
  market: Market;
  onMarketChange: (market: Market) => void;
  keyword: string;
  ledgerId?: number;
  onFetchingChange?: (fetching: boolean) => void;
  openStock: (stock: { tsCode: string }) => void;
};

const MARKET_OPTIONS: { key: Market; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业板" },
  { key: "STAR", label: "科创板" },
  { key: "DELISTED", label: "退市" },
];
const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "1w", label: "近一周" },
  { key: "1m", label: "近一个月" },
  { key: "3m", label: "近三个月" },
  { key: "6m", label: "近半年" },
  { key: "1y", label: "近一年" },
  { key: "3y", label: "近三年" },
  { key: "all", label: "全部" },
];
const TOP_N_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const QUERY_OPTIONS = {
  retry: 1,
  staleTime: 60_000,
  placeholderData: () => undefined,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};
// 两个方向只做同一真实源的投影；快照不一致时不能拼成一个成功榜单。
const SHARED_METADATA = [
  "asOf", "windowStart", "windowTradingDays", "method", "dataUpdatedAt", "fetchedAt",
  "days", "completeWindow", "eligibleCount", "excludedCount", "requestedStart", "coverageNote",
] as const;

function dateText(value: string | null) {
  if (!value) return "未提供";
  const match = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value;
}
function timeText(value: string | null) {
  if (!value) return "未提供";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未提供";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date);
}
function sixDigitCode(tsCode: string) {
  return tsCode.split(".")[0].padStart(6, "0");
}
function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})(?:-?(\d{2}))-?(\d{2})$/);
  if (!match || (!/^\d{8}$/.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value))) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
function validTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}
function validateRanking(data: RankingData | undefined, input: RankingInput, direction: Direction): "mismatch" | "malformed" | null {
  if (data === undefined) return null;
  if (!data || typeof data !== "object") return "malformed";
  if (data.period !== input.period || data.topN !== input.topN || data.market !== input.market || data.direction !== direction) return "mismatch";
  if (data.method !== "daily-reference-compound" || !Array.isArray(data.items) || data.items.length > input.topN ||
    !Number.isInteger(data.windowTradingDays) || data.windowTradingDays < 0 || data.days !== data.windowTradingDays ||
    typeof data.completeWindow !== "boolean" || !Number.isInteger(data.eligibleCount) || data.eligibleCount < data.items.length ||
    !Number.isInteger(data.excludedCount) || data.excludedCount < 0 ||
    (data.coverageNote !== null && typeof data.coverageNote !== "string") || !validTimestamp(data.fetchedAt) ||
    (data.dataUpdatedAt !== null && !validTimestamp(data.dataUpdatedAt))) return "malformed";
  const start = validDate(data.windowStart);
  const end = validDate(data.asOf);
  if (data.windowTradingDays === 0) {
    if (data.windowStart !== null || data.asOf !== null || data.completeWindow || data.items.length) return "malformed";
  } else if (!start || !end || start > end || (data.items.length > 0 && !data.completeWindow)) return "malformed";
  const requestedStart = validDate(data.requestedStart);
  if (input.period === "all" ? data.requestedStart !== null :
    data.windowTradingDays > 0 ? !requestedStart || !start || requestedStart > start : data.requestedStart !== null) return "malformed";
  const seen = new Set<string>();
  for (let index = 0; index < data.items.length; index++) {
    const stock = data.items[index];
    if (!stock || typeof stock.tsCode !== "string" || !/^\d{6}(?:\.[A-Z]+)?$/.test(stock.tsCode) || seen.has(stock.tsCode) ||
      typeof stock.name !== "string" || !stock.name.trim() || (stock.listStatus !== "L" && stock.listStatus !== "D") ||
      !Number.isFinite(stock.returnPercent) || (direction === "up" ? stock.returnPercent <= 0 : stock.returnPercent >= 0) ||
      !Number.isFinite(stock.firstPreClose) || stock.firstPreClose <= 0 || !Number.isFinite(stock.lastClose) || stock.lastClose <= 0 ||
      !Number.isInteger(stock.sampleDays) || stock.sampleDays <= 0 || stock.sampleDays > data.windowTradingDays) return "malformed";
    const first = validDate(stock.firstTradeDate);
    const last = validDate(stock.lastTradeDate);
    if (!first || !last || first > last || !start || !end || first < start || last > end ||
      (input.period !== "all" && (first !== start || last !== end || stock.sampleDays !== data.windowTradingDays))) return "malformed";
    const previous = data.items[index - 1];
    if (previous && ((direction === "up" ? previous.returnPercent < stock.returnPercent : previous.returnPercent > stock.returnPercent) ||
      (previous.returnPercent === stock.returnPercent && previous.tsCode > stock.tsCode))) return "malformed";
    seen.add(stock.tsCode);
  }
  return null;
}

// 父组件仅在本指标选中时挂载。区间/数量草稿不请求，市场立即作用于两个已提交榜单。
export default function StockReturnRanking({ ref, market, onMarketChange, keyword, ledgerId, onFetchingChange }: Props) {
  const [periodDraft, setPeriodDraft] = useState<Period>("1m");
  const [topNDraft, setTopNDraft] = useState(20);
  const [highlightedStocks, setHighlightedStocks] = useState<Set<string>>(() => new Set());
  const toggleHighlight = (tsCode: string) => {
    setHighlightedStocks(previous => {
      const next = new Set(previous);
      if (next.has(tsCode)) next.delete(tsCode);
      else next.add(tsCode);
      return next;
    });
  };
  const resultsRef = useRef<HTMLElement>(null);
  const [input, setInput] = useState<RankingInput>(() => ({
    period: "1m", topN: 20, market, keyword: keyword.trim() || undefined, ledgerId,
  }));
  const pending = periodDraft !== input.period || topNDraft !== input.topN ||
    market !== input.market || (keyword.trim() || undefined) !== input.keyword || ledgerId !== input.ledgerId;
  const upQuery = trpc.aiStockReturnRanking.useQuery({ ...input, direction: "up" }, QUERY_OPTIONS);
  const downQuery = trpc.aiStockReturnRanking.useQuery({ ...input, direction: "down" }, QUERY_OPTIONS);
  const upData: RankingData | undefined = upQuery.data;
  const downData: RankingData | undefined = downQuery.data;
  const isFetching = upQuery.isFetching || downQuery.isFetching;
  const refetchBoth = () => {
    void Promise.all([upQuery.refetch(), downQuery.refetch()]);
  };
  const submitQuery = () => {
    if (pending) {
      setInput({ period: periodDraft, topN: topNDraft, market, keyword: keyword.trim() || undefined, ledgerId });
    } else {
      refetchBoth();
    }
  };
  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (data) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    submitQuery();
  };
  const toggleMarket = (nextMarket: Market) => {
    const selected = nextMarket !== "all" && input.market === nextMarket ? "all" : nextMarket;
    onMarketChange(selected);
    // 只改变已提交市场，不悄悄应用尚未提交的区间/名次草稿。
    if (selected === input.market) refetchBoth();
    else setInput(previous => ({ ...previous, market: selected }));
  };
  useImperativeHandle(ref, () => ({ refetch: submitQuery }));
  useEffect(() => {
    onFetchingChange?.(isFetching);
  }, [isFetching, onFetchingChange]);
  useEffect(() => () => onFetchingChange?.(false), [onFetchingChange]);

  const upValidation = validateRanking(upData, input, "up");
  const downValidation = validateRanking(downData, input, "down");
  const mismatch = upValidation === "mismatch" || downValidation === "mismatch";
  const malformed = upValidation === "malformed" || downValidation === "malformed";
  const sourceMismatch = !!upData && !!downData && !mismatch && !malformed &&
    SHARED_METADATA.some(key => upData[key] !== downData[key]);
  const failed = !!upQuery.error || !!downQuery.error || mismatch || malformed || sourceMismatch;
  const data = !pending && !isFetching && upData && downData && !failed ? upData : undefined;
  const ready = !!data;
  // 不重算、不重排、不补股票；空位与另一侧共享名次行。
  const upItems = ready && upData ? upData.items : [];
  const downItems = ready && downData ? downData.items : [];
  const rowCount = Math.max(upItems.length, downItems.length);
  const ranks = Array.from({ length: rowCount }, (_, index) => index);
  const periodLabel = PERIOD_OPTIONS.find(option => option.key === input.period)?.label ?? "最近区间";
  const buttonStyle = (active: boolean) => ({
    background: active ? AI_STOCK_THEME.accentSoft : AI_STOCK_THEME.surface,
    color: active ? AI_STOCK_THEME.accent : AI_STOCK_THEME.muted,
    borderColor: active ? AI_STOCK_THEME.accent : AI_STOCK_THEME.border,
  });

  return (
    <div className="min-w-0 space-y-3" data-testid="stock-return-ranking" data-pending={pending}>
      <form noValidate onSubmit={submitForm} aria-label="区间涨跌幅查询条件" data-testid="stock-return-controls"
        className="min-w-0 space-y-3 rounded-2xl border p-3"
        style={{ background: AI_STOCK_THEME.card, borderColor: AI_STOCK_THEME.border, boxShadow: AI_STOCK_THEME.shadow }}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">区间涨跌幅</h2>
          <StockRankingImageDownload targetRef={resultsRef} disabled={!ready || rowCount === 0}
            periodLabel={periodLabel} marketLabel={MARKET_OPTIONS.find(option => option.key === input.market)?.label ?? "全市场"}
            windowStart={data?.windowStart ?? null} asOf={data?.asOf ?? null} topN={input.topN} dataUpdatedAt={data?.dataUpdatedAt} />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <div className="min-w-0">
            <label htmlFor="stock-return-period" className="block text-xs font-medium">最近区间</label>
            <select id="stock-return-period" data-testid="stock-return-period" aria-label="最近区间" value={periodDraft}
              onChange={event => setPeriodDraft(event.target.value as Period)}
              className="mt-1 h-11 w-full min-w-0 rounded-lg border px-2 text-sm outline-none focus:border-[#087987] focus:ring-1 focus:ring-[#087987]"
              style={{ background: AI_STOCK_THEME.surface, borderColor: AI_STOCK_THEME.border, color: AI_STOCK_THEME.text }}>
              {PERIOD_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="stock-return-top-n" className="block text-xs font-medium">排名数量</label>
            <select id="stock-return-top-n" data-testid="stock-return-top-n" aria-label="排名数量" value={topNDraft}
              onChange={event => setTopNDraft(Number(event.target.value))}
              className="mt-1 h-11 w-full min-w-0 rounded-lg border px-2 text-sm tabular-nums outline-none focus:border-[#087987] focus:ring-1 focus:ring-[#087987]"
              style={{ background: AI_STOCK_THEME.surface, borderColor: AI_STOCK_THEME.border, color: AI_STOCK_THEME.text }}>
              {TOP_N_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" data-testid="stock-return-submit" disabled={isFetching && !pending}
          aria-label={isFetching && !pending ? "AI正在查询涨跌幅" : ready ? "查看涨跌幅结果" : "查涨跌幅"}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: AI_STOCK_THEME.accentGradient }}>
          {isFetching && !pending ? (
            <span className="block h-9 w-9" data-testid="stock-return-submit-ai"><AnimatedStockAILogo /></span>
          ) : ready ? "查看结果" : "查涨跌幅"}
        </button>
      </form>

      <section ref={resultsRef} aria-label="区间涨跌幅排行结果" data-testid="stock-return-results"
        data-period={input.period} data-days={data?.windowTradingDays} data-top-n={input.topN} data-market={input.market}
        aria-busy={!pending && isFetching} className="min-w-0 overflow-hidden rounded-2xl border"
        style={{ background: AI_STOCK_THEME.card, borderColor: AI_STOCK_THEME.border, boxShadow: AI_STOCK_THEME.shadow }}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b" style={{ borderColor: AI_STOCK_THEME.border }}>
          <h2 className="min-w-0 px-2 py-2.5 text-xs font-semibold" style={{ color: AI_STOCK_THEME.rise }}>涨幅榜 · 前{input.topN}{data && <span className="whitespace-nowrap text-[10px] font-normal">（{input.period === "all" ? "天数各异" : `${data.windowTradingDays}天`}）</span>}</h2>
          <h2 className="min-w-0 border-l px-2 py-2.5 text-xs font-semibold" style={{ color: AI_STOCK_THEME.fall, borderColor: AI_STOCK_THEME.border }}>跌幅榜 · 前{input.topN}{data && <span className="whitespace-nowrap text-[10px] font-normal">（{input.period === "all" ? "天数各异" : `${data.windowTradingDays}天`}）</span>}</h2>
        </div>
        {pending ? (
          <div role="status" data-testid="stock-return-pending" className="px-4 py-8 text-center text-xs leading-5" style={{ color: AI_STOCK_THEME.muted }}>查询条件已修改，请点击“查涨跌幅”。</div>
        ) : isFetching ? (
          <div role="status" aria-label="正在读取涨幅榜与跌幅榜" data-testid="stock-return-loading"
            className="grid min-w-0 animate-pulse grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ background: AI_STOCK_THEME.surface }}>
            {[0, 1, 2, 3, 4, 5].map(index => <div key={index} className={`flex min-h-9 min-w-0 items-center border-b px-2 ${index % 2 ? "border-l" : ""}`}
              style={{ borderColor: AI_STOCK_THEME.border }}><span className="h-3 w-full rounded" style={{ background: AI_STOCK_THEME.border }} /></div>)}
          </div>
        ) : failed || !data ? (
          <div role="alert" data-testid="stock-return-error" className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <AlertCircle className="h-7 w-7" style={{ color: AI_STOCK_THEME.rise }} />
            <p className="text-sm font-medium">区间涨跌幅数据加载失败</p>
            <p className="text-xs leading-5" style={{ color: AI_STOCK_THEME.muted }}>{sourceMismatch ? "左右榜的真实源快照暂不一致，请重试。两榜必须采用同一份真实、同区间日线源，不拼接不同读取批次。" : mismatch ? "返回的查询参数与当前条件不一致，请重试。" : malformed ? "返回数据的格式、区间或排序暂不可用，请稍后重试。" : "暂时无法完整读取涨跌两榜的真实日线数据，请检查网络或稍后重试。"}</p>
            <button type="button" onClick={submitQuery} disabled={isFetching} className="min-h-11 rounded-full px-5 text-xs text-white disabled:opacity-60" style={{ background: AI_STOCK_THEME.accent }}>重试</button>
          </div>
        ) : rowCount === 0 ? (
          <div data-testid="stock-return-empty" className="px-4 py-8 text-center">
            <p className="text-sm font-medium">暂无符合条件的真实区间涨跌数据</p>
            <p className="mt-2 text-xs leading-5" style={{ color: AI_STOCK_THEME.muted }}>{!data.completeWindow ? "日线日期覆盖不足，不展示不完整区间排行。" : data.eligibleCount > 0 ? "符合完整日线条件的股票中暂无累计上涨或下跌的股票。" : "当前区间、市场与关键词下没有日期覆盖完整的日线；请调整条件后查询。"}</p>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="stock-return-rows">
            {(["up", "down"] as const).map(direction => {
              const items = direction === "up" ? upItems : downItems;
              return (
                <ol key={direction} className="contents" role="list" aria-label={direction === "up" ? "涨幅榜" : "跌幅榜"} data-testid={`stock-return-${direction}-list`}>
                  {ranks.map(index => {
                    const stock = items[index];
                    const cellStyle = { gridColumn: direction === "up" ? 1 : 2, gridRow: index + 1, borderColor: AI_STOCK_THEME.border };
                    const cellClass = `min-w-0 ${direction === "down" ? "border-l " : ""}${index < rowCount - 1 ? "border-b" : ""}`;
                    if (!stock) return (
                      <li key={`empty-${index}`} className={`${cellClass} flex min-h-9 items-center justify-center px-1 text-[10px]`} style={{ ...cellStyle, color: AI_STOCK_THEME.dim }}
                        aria-hidden={items.length > 0 || index > 0 ? true : undefined}>
                        {items.length === 0 && index === 0 ? direction === "up" ? "暂无上涨股票" : "暂无下跌股票" : null}
                      </li>
                    );
                    const name = aiStockDisplayName(stock.name, stock.listStatus);
                    const code = sixDigitCode(stock.tsCode);
                    const percent = `${stock.returnPercent > 0 ? "+" : ""}${stock.returnPercent.toFixed(2)}%`;
                    const dates = `${dateText(stock.firstTradeDate)} 至 ${dateText(stock.lastTradeDate)}`;
                    const displayName = `${name}${aiStockNeedsDelistedBadge(name, stock.listStatus) ? " · 退市" : ""}`;
                    const highlighted = highlightedStocks.has(stock.tsCode);
                    return (
                      <li key={stock.tsCode} className={cellClass} style={cellStyle}>
                        <button type="button" data-testid="stock-return-row" data-direction={direction} data-rank={index + 1}
                          data-ts-code={stock.tsCode} data-return-percent={stock.returnPercent} data-sample-days={stock.sampleDays}
                          data-first-trade-date={stock.firstTradeDate} data-last-trade-date={stock.lastTradeDate}
                          data-highlighted={highlighted} aria-pressed={highlighted}
                          onClick={() => toggleHighlight(stock.tsCode)} title={`${name} ${code} · ${percent} · ${stock.sampleDays}天 · ${dates} · 点击${highlighted ? "取消" : "开启"}高亮`}
                          aria-label={`${highlighted ? "取消" : "开启"}${name}高亮，${direction === "up" ? "涨幅" : "跌幅"}榜排名${index + 1}，${percent}`}
                          className="flex min-h-9 w-full min-w-0 items-center justify-between gap-1 px-2 py-1 text-left transition-colors hover:bg-[#E4F4F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#087987]"
                          style={highlighted ? { background: "linear-gradient(100deg, #B9F0F3 0%, #DDF8FA 100%)", boxShadow: "inset 3px 0 0 #13B9CD, inset 0 0 12px rgba(46,206,224,0.20)" } : undefined}>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium" style={highlighted ? { color: AI_STOCK_THEME.accent, fontWeight: 700 } : undefined} title={displayName}>{displayName}</span>
                          <span className="max-w-[58%] shrink-0 truncate text-xs font-semibold tabular-nums" title={percent}
                            style={{ color: direction === "up" ? AI_STOCK_THEME.rise : AI_STOCK_THEME.fall }}>{percent}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              );
            })}
          </div>
        )}
        {ready && (
          <div role="group" aria-label="筛选排行市场" data-testid="stock-return-market-filter"
            className="grid min-w-0 grid-cols-6 gap-1 border-t px-2 py-2"
            style={{ background: AI_STOCK_THEME.surface, borderColor: AI_STOCK_THEME.border }}>
            {MARKET_OPTIONS.map(option => (
              <button key={option.key} type="button" data-testid={`stock-return-market-${option.key}`}
                aria-pressed={input.market === option.key} onClick={() => toggleMarket(option.key)}
                className="min-h-9 min-w-0 whitespace-nowrap rounded-md border px-0.5 text-[11px] font-medium"
                style={buttonStyle(input.market === option.key)}>{option.label}</button>
            ))}
          </div>
        )}
      </section>

      <section aria-label="区间涨跌幅统计口径" data-testid="stock-return-explanation" className="min-w-0 space-y-1 rounded-xl border px-3 py-2.5 text-[11px] leading-5"
        style={{ background: AI_STOCK_THEME.surface, borderColor: AI_STOCK_THEME.border, color: AI_STOCK_THEME.muted }}>
        <p className="font-semibold" style={{ color: AI_STOCK_THEME.text }}>区间累计涨跌幅，不是涨天率</p>
        <p>区间与数量点击“查涨跌幅”后同时更新左右两榜；查询结果出来后，可在结果容器底部选择市场，点击板块立即生效，再点同一板块恢复全市场。点击股票开启高亮，再点取消，左右榜均支持复选；高亮仅用于当前页面标记，不会加入收藏。</p>
        <p>查询中显示动态AI图标，完成后点击“查看结果”定位到排行；修改区间或数量后可重新查询。</p>
        <p>左右榜均采用同一份真实、同区间日线源，分别展示上涨与下跌股票；只展示实际返回的名次，各侧不足留空，不补足榜单。</p>
        <p>最近区间按自然日期回溯（周 / 月 / 年），使用共同交易日窗口，仅累计已完成交易日收盘数据，不混入盘中价格；日期覆盖不完整不参与排名。</p>
        <p>数据源：日线 close / pre_close（收盘价 / 前收盘价），采用数据源前收盘口径。累计值为 ∏(close ÷ pre_close) − 1，不代表含分红再投资的总收益。</p>
        {data && (
          <div className="space-y-1 border-t pt-2" style={{ borderColor: AI_STOCK_THEME.border }} data-testid="stock-return-window">
            <p className="font-medium" style={{ color: AI_STOCK_THEME.text }}>行情截止：{dateText(data.asOf)} · 非盘中实时</p>
            {input.period !== "all" && <p>所选区间：{periodLabel} · 自然日期起点：{dateText(data.requestedStart)}</p>}
            <p>{input.period === "all" ? "市场日线覆盖" : "实际交易日窗口"}：{dateText(data.windowStart)} 至 {dateText(data.asOf)} · 实际 {data.windowTradingDays} 个交易日</p>
            {input.period === "all" && <p>全部按个股上市至最后交易日累计，各股日期范围与样本量可能不同；完整首末日期可在股票提示或无障碍说明中查看，不是统一上市时间。全生命周期历史尚未全部补齐，缺日、停牌或缺上市起点的股票排除。</p>}
            {data.coverageNote && <p role="status" data-testid="stock-return-coverage-note" className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">{data.coverageNote}</p>}
            <p>缓存入库时间：{timeText(data.dataUpdatedAt)}（北京时间）</p>
            <p>本次读取时间：{timeText(data.fetchedAt)}（北京时间）</p>
            <p>符合完整日线条件 {data.eligibleCount.toLocaleString("zh-CN")} 只 · 排除 {data.excludedCount.toLocaleString("zh-CN")} 只</p>
            {!data.completeWindow && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 font-medium text-amber-800">日线日期覆盖未达到所选区间要求，本次不生成排行。请改选较近区间或待历史数据补齐后重新查询。</p>}
          </div>
        )}
        <p className="pt-2 text-center text-[10px]">仅展示真实接口返回的排行，不补足榜单。仅供指标比较，不构成投资建议。</p>
      </section>
    </div>
  );
}
