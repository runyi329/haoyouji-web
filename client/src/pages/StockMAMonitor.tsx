/**
 * A股收盘确认的成交量加权均价监控。
 * 账本路由：/ledger/:id/stock-monitor；首页路由：/stock-tracker/stock-monitor。
 * 仅消费已发布日线结果，不请求盘中权限、不启动行情采集或后台任务。
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { AlertCircle, ArrowDownWideNarrow, Check, ChevronDown, ListFilter, LockKeyhole, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import AIStockNavigation from "@/components/AIStockNavigation";
import AnimatedStockAILogo from "@/components/AnimatedStockAILogo";
import StockMiniCandlestick from "@/components/StockMiniCandlestick";
import StockChipDistribution, { chipDate, matchingChipDistribution, validChipDistribution } from "@/components/StockChipDistribution";
import StockConsecutiveDaySquares from "@/components/StockConsecutiveDaySquares";
import ChipCostModelExplanation from "@/components/ChipCostModelExplanation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAIStockFavorites } from "@/hooks/useAIStockFavorites";
import { AI_STOCK_THEME } from "@/lib/ai-stock-theme";
import { trpc } from "@/lib/trpc";
import { STOCK_MA_MONITOR_PRESETS } from "../../../shared/stock-ma-monitor";
import type {
  StockChipDistributionResult,
  StockLatestChipCost,
  StockMAMonitorCandle,
  StockMAMonitorChartInput,
  StockMAMonitorChartResult,
  StockMAMonitorItem,
  StockMAMonitorMarket,
  StockMAMonitorPeriod,
  StockMAMonitorPreset,
  StockMAMonitorResult,
  StockMAMonitorSort,
} from "../../../shared/stock-ma-monitor";

const PAGE_SIZE = 20;
const PRESET_KEYS = ["short", "medium", "long"] as const;
type MonitorBoard = Exclude<StockMAMonitorMarket, "all">;
const MARKETS: { key: StockMAMonitorMarket; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业" },
  { key: "STAR", label: "科创" },
];
const SORTS: { key: StockMAMonitorSort; label: string }[] = [
  { key: "newest", label: "新符合优先" },
  { key: "longest", label: "连续最多" },
  { key: "code", label: "代码排序" },
];

// 保留行情源的实际日期，不拿今天或请求时间替代。
function dateText(value: string | null | undefined) {
  if (!value) return "未提供";
  const match = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value;
}
function updateTimeText(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
}
function periodKey(periods: readonly StockMAMonitorPeriod[]) {
  return [...periods].sort((a, b) => a - b).join(",");
}
function validItem(stock: StockMAMonitorItem, periods: StockMAMonitorPeriod[]) {
  if (!stock || typeof stock.tsCode !== "string" || typeof stock.name !== "string" || !stock.name.trim()
    || !Number.isFinite(stock.close) || stock.close <= 0
    || !Number.isInteger(stock.consecutiveDays) || stock.consecutiveDays < 1
    || typeof stock.consecutiveIsLowerBound !== "boolean"
    || !(stock.changePercent === null || Number.isFinite(stock.changePercent))
    || !stock.averages || !Array.isArray(stock.candles)) return false;
  // 展示已确认符合的股票；接口异常不被悄悄过滤成空结果。
  let previous = stock.close;
  for (const period of [...periods].sort((a, b) => a - b)) {
    const average = stock.averages[period];
    if (typeof average !== "number" || !Number.isFinite(average) || average <= 0 || previous <= average) return false;
    previous = average;
  }
  return true;
}

/** 只采用与当前榜单同快照、同条件且基准明确的前复权展示图。 */
export function matchingQfqChart(chart: StockMAMonitorChartResult | undefined, input: StockMAMonitorChartInput) {
  return Boolean(input.asOf && input.sourceVersion && chart
    && chart.chartStatus === "ready" && chart.priceBasis === "qfq"
    && chart.tsCode === input.tsCode && chart.asOf === input.asOf && chart.sourceVersion === input.sourceVersion
    && Array.isArray(chart.periods) && periodKey(chart.periods) === periodKey(input.periods)
    && Array.isArray(chart.candles) && chart.candles.length > 0);
}

/** 日K只展示真实OHLC和原有G，不再绘制任何历史筹码点。 */
export function monitorDisplayCandles(raw: StockMAMonitorCandle[], chart?: StockMAMonitorChartResult): StockMAMonitorCandle[] {
  return (chart?.candles ?? raw).map(candle => ({ ...candle, chipAverageCost: null }));
}

/** 报价不依赖qfq/ready；仍必须是当前股票、条件及行情快照的原始响应。 */
export function matchingChipCostChart(chart: StockMAMonitorChartResult | undefined, input: StockMAMonitorChartInput): boolean {
  return Boolean(chart && chipDate(input.asOf) && input.sourceVersion
    && chart.tsCode === input.tsCode && chart.sourceVersion === input.sourceVersion
    && chart.asOf === input.asOf && Array.isArray(chart.periods) && periodKey(chart.periods) === periodKey(input.periods));
}

/** 只选真实已发布且不晚于行情日期的原始单值，不推算价差或持仓成本。 */
export function latestPublishedChipCost(candidates: readonly (StockLatestChipCost | undefined)[], asOf: string): StockLatestChipCost | undefined {
  const limit = chipDate(asOf);
  if (!limit) return undefined;
  return candidates.reduce<StockLatestChipCost | undefined>((latest, candidate) => {
    const actualDate = chipDate(candidate?.asOf);
    if (!candidate || !actualDate || actualDate > limit || candidate.source !== "Tushare cyq_perf.weight_avg"
      || candidate.estimated !== true || !["current", "previous", "cached"].includes(candidate.status)
      || typeof candidate.value !== "number" || !Number.isFinite(candidate.value) || candidate.value <= 0
      || !Number.isFinite(Date.parse(candidate.fetchedAt))) return latest;
    return !latest || actualDate > chipDate(latest.asOf)! ? candidate : latest;
  }, undefined);
}

export function chipDistributionEnabled(visible: boolean, mode: "average" | "chip-cost", input: StockMAMonitorChartInput): boolean {
  return visible && mode === "chip-cost" && Boolean(input.asOf && input.sourceVersion);
}

/** 传输失败、错股/版本或异常记录不是“没有分布”；未请求也不冒充无记录。 */
export function chipDistributionEmptyState(
  result: StockChipDistributionResult | undefined,
  input: StockMAMonitorChartInput,
  failed = false,
  placeholder = false,
): "idle" | "missing" | "error" | undefined {
  if (failed || placeholder) return "error";
  if (result === undefined) return "idle";
  if (!matchingChipDistribution(result, input)) return "error";
  if (result.status === "missing" && result.asOf === null && result.weightAvg === null
    && Array.isArray(result.points) && result.points.length === 0
    && Number.isFinite(Date.parse(result.fetchedAt))) return "missing";
  return validChipDistribution(result) ? undefined : "error";
}

export function chipDistributionCacheMs(result: StockChipDistributionResult | undefined, input: StockMAMonitorChartInput): number {
  return matchingChipDistribution(result, input) && validChipDistribution(result) ? 30 * 60_000 : 0;
}

/** 只反用已经通过的样本线性价格映射；不把未复权现价直接塞入未知筹码尺度。 */
export function alignedChipReferencePrice(
  stock: StockMAMonitorItem,
  input: StockMAMonitorChartInput,
  chart: StockMAMonitorChartResult | undefined,
  distribution: StockChipDistributionResult | undefined,
): number | undefined {
  const quoteDate = chipDate(input.asOf);
  if (!quoteDate || stock.tsCode !== input.tsCode || !Number.isFinite(stock.close) || stock.close <= 0
    || !matchingQfqChart(chart, input) || !chart || chart.chipVerification !== "sample"
    || chipDate(chart.anchorDate) !== quoteDate || !matchingChipDistribution(distribution, input)
    || !validChipDistribution(distribution) || distribution.weightAvg === null) return undefined;
  const distributionDate = chipDate(distribution.asOf);
  const nativeCost = chart.latestChipCost;
  if (!distributionDate || !nativeCost || nativeCost.source !== "Tushare cyq_perf.weight_avg"
    || nativeCost.estimated !== true || !["current", "previous", "cached"].includes(nativeCost.status)
    || chipDate(nativeCost.asOf) !== distributionDate || typeof nativeCost.value !== "number"
    || !Number.isFinite(nativeCost.value) || nativeCost.value <= 0
    || Math.abs(nativeCost.value - distribution.weightAvg) > 0.000001) return undefined;
  const quotePoints = chart.candles.filter(point => chipDate(point.date) === quoteDate);
  const checkedPoints = chart.candles.filter(point => chipDate(point.date) === distributionDate);
  if (quotePoints.length !== 1 || checkedPoints.length !== 1
    || !Number.isFinite(quotePoints[0].close) || Math.abs(quotePoints[0].close - stock.close) > 0.000001) return undefined;
  const checked = checkedPoints[0];
  if (checked.chipStatus !== "ready" || typeof checked.chipAverageCost !== "number"
    || !Number.isFinite(checked.chipAverageCost) || checked.chipAverageCost <= 0) return undefined;
  // K_qfq / K_native是该日已核对的线性倍率；逆映射当前锚点收盘至分布原生价位。
  const mappedPrice = stock.close * (distribution.weightAvg / checked.chipAverageCost);
  return Number.isFinite(mappedPrice) && mappedPrice > 0 ? mappedPrice : undefined;
}

export function MonitorCard({ stock, periods, asOf, sourceVersion, ledgerId, isFavorite, canFavorite, onFavorite, onChipExplanation }: {
  stock: StockMAMonitorItem;
  periods: StockMAMonitorPeriod[];
  asOf: string | null;
  sourceVersion?: string;
  ledgerId?: number;
  isFavorite: boolean;
  canFavorite: boolean;
  onFavorite: (tsCode: string) => void;
  onChipExplanation?: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [localMode, setLocalMode] = useState<"average" | "chip-cost">("average");
  const retainedCost = useRef<{ scope: string; quote: StockLatestChipCost } | null>(null);
  const retainedDistribution = useRef<{ scope: string; result: StockChipDistributionResult } | null>(null);
  useEffect(() => {
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.target === element && entry.isIntersecting));
    }, { rootMargin: "0px", threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const chartInput: StockMAMonitorChartInput = { ledgerId, tsCode: stock.tsCode, periods, asOf: asOf ?? "", sourceVersion: sourceVersion ?? "" };
  const chartQuery = trpc.aiStockMAMonitorChart.useQuery(chartInput, {
    enabled: visible && Boolean(asOf && sourceVersion),
    staleTime: 30 * 60_000,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: undefined,
  });
  const distributionQuery = trpc.aiStockChipDistribution.useQuery(chartInput, {
    enabled: chipDistributionEnabled(visible, localMode, chartInput),
    staleTime: query => chipDistributionCacheMs(query.state.data, chartInput),
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: undefined,
  });
  const chart: StockMAMonitorChartResult | undefined = !chartQuery.error && !chartQuery.isPlaceholderData
    && matchingQfqChart(chartQuery.data, chartInput) ? chartQuery.data : undefined;
  const displayCandles = monitorDisplayCandles(stock.candles, chart).slice(-30);
  const rawChart = !chartQuery.error && !chartQuery.isPlaceholderData && matchingChipCostChart(chartQuery.data, chartInput)
    ? chartQuery.data : undefined;
  const rawDistribution: StockChipDistributionResult | undefined = !distributionQuery.error && !distributionQuery.isPlaceholderData
    && matchingChipDistribution(distributionQuery.data, chartInput) ? distributionQuery.data : undefined;
  // 缓存只在同账本、同股、同周期、同源版本内保留；日期另行检查，绝不沿用别股placeholder。
  const scope = `${ledgerId ?? "home"}:${stock.tsCode}:${periodKey(periods)}:${sourceVersion ?? ""}`;
  const priorCost = retainedCost.current?.scope === scope ? retainedCost.current.quote : undefined;
  const chipCost = latestPublishedChipCost([rawChart?.latestChipCost, rawDistribution?.latestChipCost, priorCost], chartInput.asOf);
  if (chipCost) retainedCost.current = { scope, quote: chipCost };
  else retainedCost.current = null;
  if (rawDistribution && validChipDistribution(rawDistribution)) retainedDistribution.current = { scope, result: rawDistribution };
  const previousDistribution = retainedDistribution.current?.scope === scope
    && matchingChipDistribution(retainedDistribution.current.result, chartInput) ? retainedDistribution.current.result : undefined;
  const distribution = rawDistribution && validChipDistribution(rawDistribution) ? rawDistribution : previousDistribution;
  const distributionEmptyState = chipDistributionEmptyState(distributionQuery.data, chartInput,
    Boolean(distributionQuery.error), Boolean(distributionQuery.isPlaceholderData));
  const chipReferencePrice = alignedChipReferencePrice(stock, chartInput, chart, distribution);
  const percent = stock.changePercent;
  const quoteColor = percent === null ? AI_STOCK_THEME.muted
    : percent > 0 ? AI_STOCK_THEME.rise : percent < 0 ? AI_STOCK_THEME.fall : AI_STOCK_THEME.text;
  const daysText = `${stock.consecutiveIsLowerBound ? "≥" : ""}${stock.consecutiveDays}天`;
  const daysTitle = `截至结果日期，连续${stock.consecutiveDays}个交易日收盘符合所选均价条件，不是连续上涨。${stock.consecutiveIsLowerBound ? "数据左边界之前尚未找到不符合日，因此为已知下限，实际持续天数可能更长。" : "按实际可确认的连续符合交易日计数。"}`;

  const cardTabStyle = (active: boolean) => ({
    color: active ? "#FFFFFF" : AI_STOCK_THEME.muted,
    background: active ? "linear-gradient(135deg, #087987, #0A818D)" : "#DFE9E6",
    boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.28)" : "inset 0 1px 3px rgba(20,42,63,0.10)",
    fontWeight: active ? 600 : 500,
  });
  const quoteNumberSize = (value: number) => `clamp(12px,calc((100cqw - 70px) / ${value.toFixed(2).length * 0.58}),20px)`;
  const quoteBlock = (
    <div data-stock-monitor-quote-block="true" style={{ containerType: "inline-size" }} className="min-w-0">
      <div data-stock-monitor-chip-quote-row="true" className="mt-1 flex min-w-0 flex-nowrap items-baseline gap-x-2 tabular-nums">
        {chipCost ? <Popover>
          <PopoverTrigger asChild>
            <button type="button" data-stock-monitor-chip-cost={chipCost.value} aria-label={`筹码成本${chipCost.value!.toFixed(2)}元，点击查看供应商模型说明`}
              title={`实际成本日期：${dateText(chipCost.asOf)}；${chipDate(chipCost.asOf) === chipDate(asOf) ? "最新行情日已发布记录" : "此前最近已发布记录"}；${chipCost.source}；供应商模型估计值，非账户真实持仓成本`}
              className="min-h-7 max-w-full break-words rounded p-0 text-xl font-bold leading-7 tabular-nums whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]" style={{ color: AI_STOCK_THEME.accent, fontSize: quoteNumberSize(chipCost.value!) }}>
              {chipCost.value!.toFixed(2)}<span className="ml-0.5 text-xs font-medium">元</span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" collisionPadding={12} className="w-64 max-w-[calc(100vw_-_24px)] rounded-xl border-[#DCE7F0] bg-white p-3 text-[11px] leading-5 text-[#142A3F] shadow-lg">
            <p>实际成本日期：{dateText(chipCost.asOf)}。{chipDate(chipCost.asOf) === chipDate(asOf) ? "这是该行情日期已发布的供应商记录。" : "展示此前最近已发布的供应商记录，不将其标成行情当日成本。"}</p>
            <p>来源：{chipCost.source}。该指标结合历史成交与换手变化，概括模型估计的存量筹码成本。</p>
            <p>统计口径为市场层面的模型估计值（estimated）；个人账户真实成本另需依据其交易与费用记录确定。卡片按钮仅切换展示，不影响筛选，当前展示也不自动计算与现价的价差。</p>
          </PopoverContent>
        </Popover> : <span data-stock-monitor-chip-cost="missing" className="text-xl font-bold leading-7" style={{ color: AI_STOCK_THEME.muted }}>—</span>}
        <button type="button" data-stock-monitor-chip-explanation="true" aria-label="查看筹码成本模型说明" aria-haspopup="dialog" onClick={onChipExplanation} className="shrink-0 cursor-pointer whitespace-nowrap bg-transparent p-0 text-xs font-medium leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]" style={{ color: AI_STOCK_THEME.muted }}>筹码成本</button>
      </div>
      {/* 两模式共用同一报价DOM与字号规则，只有下方图形变化。 */}
      <div data-stock-monitor-latest-quote-row="true" className="mt-0.5 flex min-w-0 flex-nowrap items-baseline gap-x-2 tabular-nums" style={{ color: quoteColor }}>
        <p title="结果日期的收盘价，非盘中实时价" className="min-w-0 whitespace-nowrap text-xl font-bold leading-7" style={{ fontSize: quoteNumberSize(stock.close) }}>
          {stock.close.toFixed(2)}<span className="ml-0.5 text-xs font-medium">元</span>
        </p>
        <span title="相对上一交易日的收盘涨跌幅" className="shrink-0 whitespace-nowrap text-xs font-semibold leading-5">
          {percent === null ? "—%" : `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`}
        </span>
      </div>
    </div>
  );

  return (
    <article
      ref={cardRef}
      data-stock-monitor-card={stock.tsCode}
      data-stock-monitor-card-periods={periods.join(",")}
      aria-label={`${stock.name}，最近收盘${stock.close.toFixed(2)}元，连续符合${daysText}`}
      className="flex h-[287px] min-w-0 flex-col rounded-xl border border-[#AFDED2] bg-[#E8F5EF] p-2.5"
    >
      {/* 股票名称与收藏保持原位，筹码模式仅重排其下主体。 */}
      <div className="flex min-w-0 shrink-0 items-start gap-1">
        <div data-stock-monitor-card-heading="true" className="flex h-10 min-w-0 flex-1 flex-col">
          <h3 title={stock.name} className="min-w-0 truncate text-base font-semibold leading-5">{stock.name}</h3>
          <div className="mt-0.5 min-w-0">
            <StockConsecutiveDaySquares days={stock.consecutiveDays} isLowerBound={stock.consecutiveIsLowerBound} title={daysTitle} />
          </div>
        </div>
        <button
          type="button"
          data-stock-favorite={stock.tsCode}
          aria-label={`${isFavorite ? "取消收藏" : "收藏"}${stock.name}`}
          aria-pressed={isFavorite}
          title={canFavorite ? (isFavorite ? "取消收藏" : "收藏到我的股票") : "登录后可收藏"}
          disabled={!canFavorite}
          onClick={event => { event.stopPropagation(); onFavorite(stock.tsCode); }}
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
          style={{ color: isFavorite ? "#C89A3D" : AI_STOCK_THEME.muted }}
        >
          <Star aria-hidden="true" className="h-5 w-5" strokeWidth={1.6} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div data-stock-monitor-card-body="true" className="relative grid min-h-0 flex-1 grid-rows-[70px_minmax(0,1fr)] overflow-hidden">
        <div data-stock-monitor-shared-quote="true" className="min-h-0 min-w-0 overflow-auto overscroll-contain [scrollbar-width:none]">
          {quoteBlock}
        </div>
        <div data-stock-monitor-chart-region="true" className="relative min-h-0 min-w-0 overflow-hidden">
          {localMode === "average" ? <div className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none]">
            <p data-stock-monitor-price-basis={chart ? "qfq" : "unadjusted"} className="mt-1 text-[10px] leading-4" style={{ color: AI_STOCK_THEME.muted }}>
              {chart ? "前复权日K" : "原始日K"}
            </p>
            <div className="mt-1 w-full min-w-0 [&_svg]:block [&_svg]:w-full [&_svg]:max-w-full" data-stock-monitor-kline="true">
              <StockMiniCandlestick candles={displayCandles} name={stock.name} />
            </div>
          </div> : <div data-stock-monitor-chip-stage="true" className="relative h-full min-h-0 min-w-0 overflow-hidden">
            <span data-stock-monitor-price-basis="supplier-native" className="sr-only">筹码成本分布</span>
            <StockChipDistribution result={distribution} name={stock.name} height={130} plotTop={20} plotBottom={98} focusBinCount={10} amplitudeScale="soft-log" priceBinSize={0.5} referencePrice={chipReferencePrice} loading={Boolean(distributionQuery.isFetching)} emptyState={distributionEmptyState}
              onRetry={chipDistributionEnabled(visible, localMode, chartInput) ? () => { if (!distributionQuery.isFetching) void distributionQuery.refetch({ throwOnError: false }); } : undefined} />
          </div>}
        </div>
      </div>
      <div role="group" aria-label={`${stock.name}卡片图表切换`} data-stock-monitor-card-mode={localMode} className="-mx-2.5 -mb-2.5 mt-2 grid w-[calc(100%+1.25rem)] min-w-0 shrink-0 grid-cols-2 overflow-hidden rounded-b-xl border-t border-[#B6DBD4]">
        <button type="button" data-stock-monitor-card-toggle="average" aria-pressed={localMode === "average"}
          onClick={() => setLocalMode("average")} className="flex h-[26px] w-full min-w-0 items-center justify-center border-r border-[#B6DBD4] px-1 text-[11px] leading-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
          style={cardTabStyle(localMode === "average")}>加权均价</button>
        <button type="button" data-stock-monitor-card-toggle="chip-cost" aria-pressed={localMode === "chip-cost"}
          onClick={() => setLocalMode("chip-cost")} className="flex h-[26px] w-full min-w-0 items-center justify-center px-1 text-[11px] leading-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
          style={cardTabStyle(localMode === "chip-cost")}>筹码成本</button>
      </div>
    </article>
  );
}

export default function StockMAMonitor({ homeMode = false }: { homeMode?: boolean } = {}) {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const routeLedgerId = Number(id);
  const ledgerId = !homeMode && Number.isSafeInteger(routeLedgerId) && routeLedgerId > 0 ? routeLedgerId : undefined;
  const validScope = homeMode || ledgerId !== undefined;
  const { user, loading: authLoading } = useAuth();
  const { favoriteCodes, toggleFavorite, ready: favoritesReady } = useAIStockFavorites(user?.id);
  const canFavorite = Boolean(user) && !authLoading && favoritesReady;
  const [selectedMarkets, setSelectedMarkets] = useState<MonitorBoard[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<StockMAMonitorPreset>("short");
  const periods: StockMAMonitorPeriod[] = [...STOCK_MA_MONITOR_PRESETS[preset].periods];
  const [sort, setSort] = useState<StockMAMonitorSort>("newest");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<"average" | "chip-cost" | "subscription" | null>(null);
  const [displayMode, setDisplayMode] = useState<"after-close" | "intraday">("after-close");
  const scrollRef = useRef<HTMLDivElement>(null);
  const allMarkets = selectedMarkets.length === 0 || selectedMarkets.length === 4;
  const queryMarkets = allMarkets ? undefined : selectedMarkets;
  const marketSummary = allMarkets ? "全部" : selectedMarkets.length === 1
    ? MARKETS.find(item => item.key === selectedMarkets[0])!.label
    : `${selectedMarkets.length}板块`;

  const query = trpc.aiStockMAMonitor.useQuery(
    { ledgerId, market: "all", ...(queryMarkets ? { markets: queryMarkets } : {}), periods, page, pageSize: PAGE_SIZE, sort },
    {
      enabled: validScope && displayMode === "after-close",
      retry: 1,
      staleTime: 5 * 60_000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      refetchInterval: false,
      // 不沿用上一板块、上一条件或上一页的 placeholderData。
      placeholderData: undefined,
    }
  );
  const data: StockMAMonitorResult | undefined = query.isPlaceholderData ? undefined : query.data;
  const mismatched = Boolean(data && (
    data.market !== "all" || (queryMarkets
      ? !Array.isArray(data.markets) || [...data.markets].sort().join(",") !== [...queryMarkets].sort().join(",")
      : data.markets !== undefined)
    || !Array.isArray(data.periods) || periodKey(data.periods) !== periodKey(periods)
    || data.page !== page || data.pageSize !== PAGE_SIZE || data.sort !== sort
  ));
  const malformed = Boolean(data && (
    data.mode !== "close-confirmed" || data.method !== "amount-volume-weighted"
    || !Number.isInteger(data.total) || data.total < 0
    || !Number.isInteger(data.eligibleCount) || data.eligibleCount < 0
    || !Number.isInteger(data.excludedCount) || data.excludedCount < 0
    || !Array.isArray(data.items) || data.items.length > PAGE_SIZE
    || (Array.isArray(data.items) && data.items.some(stock => !validItem(stock, periods)))
    || (Array.isArray(data.items) && data.items.length > 0 && !data.asOf)
    || (Array.isArray(data.items) && data.total === 0 && data.items.length > 0)
    || (Array.isArray(data.items) && data.total > 0 && page === 1 && data.items.length === 0)
  ));
  const failed = !validScope || Boolean(query.error) || mismatched || malformed;
  const ready = Boolean(data) && !failed;
  const confirmed = ready && Boolean(data?.asOf) && (data?.eligibleCount ?? 0) > 0;
  const totalPages = ready && data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : null;
  const updatedText = ready ? updateTimeText(data?.dataUpdatedAt) : null;
  const coverageText = "数据覆盖以可判断样本为准；缺日线、缺成交量或历史不足的股票不参与判断，不代表全市场完整覆盖。";
  const resetScroll = () => scrollRef.current?.scrollTo({ top: 0 });
  const refresh = () => { if (validScope && displayMode === "after-close") void query.refetch(); };
  const selectMarket = (next: StockMAMonitorMarket) => {
    setSelectedMarkets(previous => next === "all" ? []
      : previous.includes(next) ? previous.filter(item => item !== next)
      : MARKETS.filter(item => item.key !== "all" && (item.key === next || previous.includes(item.key as MonitorBoard))).map(item => item.key as MonitorBoard));
    setPage(1); resetScroll();
  };
  const selectSort = (next: StockMAMonitorSort) => {
    setSort(next); setPage(1); resetScroll();
  };
  const selectPreset = (next: StockMAMonitorPreset) => {
    setPreset(next); setPage(1); resetScroll();
  };
  const selectPage = (next: number) => {
    if (query.isFetching || !totalPages || next < 1 || next > totalPages) return;
    setPage(next); resetScroll();
  };
  const onFavorite = (tsCode: string) => {
    if (!canFavorite) return;
    if (!toggleFavorite(tsCode)) toast.error("收藏未保存，请检查浏览器存储权限或收藏数量");
  };

  return (
    <div className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-[480px] flex-col overflow-hidden" style={{ background: AI_STOCK_THEME.background, color: AI_STOCK_THEME.text }}>
      <AIStockNavigation
        active="monitor"
        ledgerId={ledgerId ?? 0}
        homeMode={homeMode}
        onBack={() => homeMode ? setLocation("/stock-tracker") : setLocation(`/ledger/${ledgerId ?? id}/ai-database`)}
        onRefresh={refresh}
        isRefreshing={query.isFetching}
      />
      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <main className="min-w-0 space-y-3 px-3 pb-5 pt-3">
          <div className="flex h-[23px] min-w-0 items-stretch gap-1.5">
            <h1 className="flex h-[23px] shrink-0 items-baseline gap-1 whitespace-nowrap text-[clamp(18px,5.87vw,22px)] font-bold leading-none">
              <button type="button" data-stock-monitor-explanation="average" aria-label="查看加权均价解释" aria-haspopup="dialog" onClick={() => setNotice("average")} className="cursor-pointer bg-transparent p-0 [font:inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]" style={{ color: "inherit", borderBottom: "1px dashed #4F8F99" }}>加权均价</button>
              <span aria-hidden="true">&amp;</span>
              <button type="button" data-stock-monitor-explanation="chip-cost" aria-label="查看筹码成本解释" aria-haspopup="dialog" onClick={() => setNotice("chip-cost")} className="cursor-pointer bg-transparent p-0 [font:inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]" style={{ color: "inherit", borderBottom: "1px dashed #4F8F99" }}>筹码成本</button>
            </h1>
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <button type="button" data-stock-monitor-mode="true" aria-label={`当前${displayMode === "after-close" ? "盘后" : "盘中"}，${STOCK_MA_MONITOR_PRESETS[preset].label}，${marketSummary}，打开模式、周期与板块筛选`} className="flex h-[23px] min-w-0 flex-1 items-center justify-evenly gap-1 whitespace-nowrap rounded-md border px-1.5 py-0 text-[11px] font-medium leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]" style={{ background: AI_STOCK_THEME.accentSoft, color: AI_STOCK_THEME.accent, borderColor: AI_STOCK_THEME.border }}>
                  <span>{displayMode === "after-close" ? "盘后" : "盘中"}</span>
                  <span aria-hidden="true" className="h-3 w-px shrink-0" style={{ background: AI_STOCK_THEME.border }} />
                  <span>{STOCK_MA_MONITOR_PRESETS[preset].label}</span>
                  <span aria-hidden="true" className="h-3 w-px shrink-0" style={{ background: AI_STOCK_THEME.border }} />
                  <span>{marketSummary}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} collisionPadding={12} className="w-48 max-w-[calc(100vw_-_24px)] rounded-xl border-[#DCE7F0] bg-white p-2 text-[#142A3F] shadow-lg" data-stock-monitor-filter="true">
                <div role="group" aria-label="监控模式" className="mb-1.5 grid grid-cols-2 gap-1 border-b border-[#DCE7F0] pb-2">
                  {(["after-close", "intraday"] as const).map(mode => (
                    <button key={mode} type="button" data-stock-monitor-mode-option={mode} aria-pressed={displayMode === mode} onClick={() => { setDisplayMode(mode); resetScroll(); }} className="min-h-8 rounded-md text-xs font-medium" style={{ background: displayMode === mode ? AI_STOCK_THEME.accentSoft : "transparent", color: displayMode === mode ? AI_STOCK_THEME.accent : AI_STOCK_THEME.muted }}>{mode === "after-close" ? "盘后" : "盘中"}</button>
                  ))}
                </div>
                <div role="group" aria-label="监控周期预设" data-stock-monitor-presets="true" data-selected-preset={preset} className="mb-1.5 grid min-w-0 grid-cols-3 gap-1 border-b border-[#DCE7F0] pb-2">
                  {PRESET_KEYS.map(key => (
                    <button key={key} type="button" data-stock-monitor-preset={key} aria-pressed={preset === key} onClick={() => selectPreset(key)} className="min-h-8 min-w-0 rounded-md px-1 text-center text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]" style={{ background: preset === key ? AI_STOCK_THEME.accentSoft : "transparent", color: preset === key ? AI_STOCK_THEME.accent : AI_STOCK_THEME.muted }}>
                      {STOCK_MA_MONITOR_PRESETS[key].label}
                    </button>
                  ))}
                </div>
                <div role="group" aria-label="复选市场板块">
                  {MARKETS.map(item => {
                    const checked = item.key === "all" ? allMarkets : selectedMarkets.includes(item.key);
                    return <button key={item.key} type="button" role="checkbox" aria-checked={checked} onClick={() => selectMarket(item.key)} data-stock-monitor-market={item.key} className="flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]" style={{ background: checked ? AI_STOCK_THEME.accentSoft : "transparent", color: checked ? AI_STOCK_THEME.accent : AI_STOCK_THEME.text }}>
                      <span>{item.label}</span><span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded border" style={{ borderColor: checked ? AI_STOCK_THEME.accent : AI_STOCK_THEME.border, background: checked ? AI_STOCK_THEME.accent : "white" }}>{checked && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}</span>
                    </button>;
                  })}
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-[#DCE7F0] px-1 pt-1.5">
                  <span className="text-[10px]" style={{ color: AI_STOCK_THEME.muted }}>板块可多选</span>
                  <button type="button" onClick={() => setFilterOpen(false)} className="min-h-7 rounded-md px-2 text-xs font-medium" style={{ color: AI_STOCK_THEME.accent }}>完成</button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <section aria-label="符合结果" aria-busy={displayMode === "after-close" && query.isFetching} data-stock-monitor-result-state={displayMode === "intraday" ? "unavailable" : failed ? "error" : !ready ? "loading" : !confirmed ? "indeterminate" : data?.total === 0 ? "empty" : "ready"} data-stock-monitor-result-periods={periods.join(",")} data-stock-monitor-page={page} className="min-w-0">
            <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-medium" style={{ color: AI_STOCK_THEME.muted }}>
                <ListFilter aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color: AI_STOCK_THEME.accent }} />
                <span>符合结果{displayMode === "after-close" && confirmed && data ? ` · ${data.total.toLocaleString("zh-CN")}` : ""}</span>
              </h2>
              <div className="relative flex shrink-0 items-center gap-1 text-[11px]" style={{ color: AI_STOCK_THEME.muted }}>
                <ArrowDownWideNarrow aria-hidden="true" className="pointer-events-none h-3.5 w-3.5" />
                <select aria-label="符合结果排序" value={sort} onChange={event => selectSort(event.target.value as StockMAMonitorSort)} className="min-h-9 appearance-none rounded-md bg-transparent py-1 pl-0.5 pr-4 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]">
                  {SORTS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-0 h-3 w-3" />
              </div>
            </div>
            {displayMode === "intraday" ? (
              <div role="status" className="rounded-xl border border-[#DCE7F0] bg-white px-4 py-9 text-center">
                <LockKeyhole aria-hidden="true" className="mx-auto mb-2 h-6 w-6" style={{ color: AI_STOCK_THEME.muted }} />
                <p className="text-sm font-medium">盘中监控尚未开通</p>
                <p className="mt-2 text-xs leading-5" style={{ color: AI_STOCK_THEME.muted }}>当前没有实时筛选结果，点开上方按钮选择“盘后”可查看收盘数据。</p>
              </div>
            ) : failed ? (
              <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-[#DCE7F0] bg-white px-4 py-9 text-center">
                <AlertCircle aria-hidden="true" className="h-7 w-7" style={{ color: AI_STOCK_THEME.muted }} />
                <p className="text-sm font-medium">{validScope ? "监控数据加载失败" : "账本信息无效"}</p>
                <p className="text-xs leading-5" style={{ color: AI_STOCK_THEME.muted }}>{!validScope ? "请从正确的账本入口打开监控页。" : mismatched ? "返回结果与当前市场、周期或页码不一致，请重试。" : malformed ? "当前数据暂不可判断，未将异常数据当作空结果。" : "暂时无法获取真实盘后行情，请检查网络或稍后重试。"}</p>
                {validScope && <button type="button" onClick={refresh} disabled={query.isFetching} className="rounded-full px-5 py-2 text-xs text-white disabled:opacity-50" style={{ background: AI_STOCK_THEME.accent }}>重试</button>}
              </div>
            ) : !ready ? (
              <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-2">
                <span className="block h-16 w-16 motion-safe:animate-bounce"><AnimatedStockAILogo /></span>
                <p className="text-xs" style={{ color: AI_STOCK_THEME.muted }}>正在读取{STOCK_MA_MONITOR_PRESETS[preset].label}盘后符合结果与连续天数…</p>
              </div>
            ) : data && !confirmed ? (
              <div role="status" className="rounded-xl border border-[#DCE7F0] bg-white px-4 py-9 text-center">
                <p className="text-sm font-medium">当前板块暂无可判断的{STOCK_MA_MONITOR_PRESETS[preset].label}收盘样本</p>
                <p className="mt-2 text-xs leading-5" style={{ color: AI_STOCK_THEME.muted }}>所选条件需足够的有效交易日历史；缺行情日期、成交额、成交量或样本不足时不可判断，不等于没有符合股票。</p>
                <button type="button" onClick={refresh} disabled={query.isFetching} className="mt-3 text-xs font-medium disabled:opacity-50" style={{ color: AI_STOCK_THEME.accent }}>重新读取</button>
              </div>
            ) : data && data.total === 0 ? (
              <div role="status" className="rounded-xl border border-[#DCE7F0] bg-white px-4 py-9 text-center">
                <p className="text-sm font-medium">暂无符合当前{STOCK_MA_MONITOR_PRESETS[preset].label}条件的股票</p>
                <p className="mt-2 text-xs leading-5" style={{ color: AI_STOCK_THEME.muted }}>该结果日期有{data.eligibleCount.toLocaleString("zh-CN")}只有效样本可判断，但没有符合股票；排除样本不计入此结论。可切换板块或短、中、长线。</p>
              </div>
            ) : data ? (
              <>
                {query.isFetching && <p role="status" className="mb-2 flex items-center gap-1.5 text-[11px]" style={{ color: AI_STOCK_THEME.muted }}><span className="block h-6 w-6"><AnimatedStockAILogo /></span>正在刷新同一条件的收盘结果…</p>}
                <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
                  {data.items.map(stock => <MonitorCard key={`${ledgerId ?? "home"}:${stock.tsCode}:${periodKey(periods)}:${data.asOf}:${data.sourceVersion ?? ""}`} stock={stock} periods={periods} asOf={data.asOf} sourceVersion={data.sourceVersion} ledgerId={ledgerId} isFavorite={favoriteCodes.has(stock.tsCode)} canFavorite={canFavorite} onFavorite={onFavorite} onChipExplanation={() => setNotice("chip-cost")} />)}
                </div>
                <nav aria-label="符合股票分页" className="mt-3 flex min-w-0 items-center justify-between gap-1.5 rounded-xl border border-[#DCE7F0] bg-white px-2 py-2">
                  <button type="button" onClick={() => selectPage(page - 1)} disabled={query.isFetching || page <= 1} className="min-h-9 shrink-0 rounded-lg px-2 text-xs disabled:opacity-35" style={{ color: AI_STOCK_THEME.accent }}>上一页</button>
                  <p className="min-w-0 text-center text-[11px] leading-4 tabular-nums" style={{ color: AI_STOCK_THEME.muted }}>第 {page} / {totalPages} 页<span className="block text-[10px]">20只/页 · 按需读取</span></p>
                  <button type="button" onClick={() => selectPage(page + 1)} disabled={query.isFetching || !totalPages || page >= totalPages} className="min-h-9 shrink-0 rounded-lg px-2 text-xs disabled:opacity-35" style={{ color: AI_STOCK_THEME.accent }}>下一页</button>
                </nav>
              </>
            ) : null}
          </section>
        </main>
      </div>

      <Dialog open={notice !== null} onOpenChange={open => { if (!open) setNotice(null); }}>
        <DialogContent data-stock-monitor-explanation-dialog={notice ?? undefined} className="max-h-[85dvh] max-w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl border-[#DCE7F0] bg-white p-4 text-[#142A3F] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left text-base">{notice === "subscription" ? "盘中监控尚未开通" : notice === "chip-cost" ? "筹码成本 · 算法说明" : "加权均价 · 计量口径"}</DialogTitle>
            <DialogDescription className="text-left text-[11px] leading-[1.75]">{notice === "subscription" ? "当前仅提供真实盘后结果。盘中监控暂未开通，不会创建订阅账户或授予实时行情权限。" : notice === "chip-cost" ? "筹码成本结合每日成交与历史换手变化，概括模型估计的存量筹码成本中枢。以下图解展示新筹码分配、旧筹码迁移与平均成本的形成方式。" : "综合均价（G）是三条真实成交量额均价的展示合成，反映所选观察周期内的成交价格中枢。"}</DialogDescription>
          </DialogHeader>
          {notice === "average" && <div className="space-y-2 text-[11px] leading-[1.75] [overflow-wrap:anywhere]" style={{ color: AI_STOCK_THEME.muted }}>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>展示与筛选：</strong>G由后台根据真实成交金额、成交股数的均价序列提供，前端只展示合成线。短、中、长线仍沿用后台原有筛选条件，展示合成不替代筛选判定。</p>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>计量含义：</strong>成交量额统一单位后计量为元/股。期间重复转手的成交会重复计入，不识别投资者身份或持仓，不代表筹码留存或个人成本。</p>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>判定与连续性：</strong>连续天数指连续交易日收盘符合所选后台条件，并非连续上涨；≥N表示可确认的历史下限。缺失量额或历史不足时不可判断。</p>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>图表价格基准：</strong>卡片现价始终是结果日期的实际收盘价。图表独立标注“原始日K”或“前复权日K”；只有同一行情快照且前复权图表可用时才切换，不能把原始图标为前复权。</p>
            <p>每张卡片底部“加权均价”显示日K与综合均价；“筹码成本”显示供应商横向成本分布。日K不叠加历史筹码线，两种展示均不改变筛选。</p>
            <p>结果基于已发布的盘后日线快照；休市或源数据未更新时保留最近已发布版本，数据入库时间不等于请求时间。</p>
            <p>{coverageText}</p>
            {ready && data && <p>当前可判断 {data.eligibleCount.toLocaleString("zh-CN")} 只 · 排除 {data.excludedCount.toLocaleString("zh-CN")} 只；排除样本不计入符合结果。</p>}
            {ready && data?.asOf && <p>结果日期：{dateText(data.asOf)}（盘后收盘数据）</p>}
            {updatedText && <p>实际数据更新：{updatedText}（北京时间）</p>}
          </div>}
          {notice === "chip-cost" && <div className="space-y-2 text-[11px] leading-[1.75] [overflow-wrap:anywhere]" style={{ color: AI_STOCK_THEME.muted }}>
            <ChipCostModelExplanation />
            <p><strong style={{ color: AI_STOCK_THEME.text }}>每日记录：</strong>卡片报价区展示最近已发布的成本，点击数值可查看实际成本日期。最新行情日尚未更新时，沿用此前最近已发布记录，并保留它的真实日期。</p>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>价位分档：</strong>图形从0.50元一档开始合并相邻原始价位；价位跨度很大时自动采用更粗的档距，实际档距标在图上。每条表示一个左闭右开的价位区间，占比是区间内原始数据的合计，不重新归一化、不插值，也不人为制造长短差异。</p>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>集中区：</strong>默认展示筹码合计最多的约十档连续价位窗口，保留真实价格顺序，并按需纳入平均成本与已对齐现价的档位。上、下尾部仅从当前坐标窗收起，图内保留它们的占比记录；点击“全部”可在同一固定高度查看完整分布，不把集中区归一化成100%。卡片、图形及底部切换高度固定；名称、小方格和上下两行报价在两模式中共用，仅下方图形切换，超长信息只在固定报价区内滚动。</p>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>如何阅读：</strong>纵轴价位保持真实线性刻度，高价在上、低价在下；横条采用标注的温和对数尺度，低占比尾部用浅色降低视觉强调，颜色不代表盈亏，长度也不表示占比的倍数。触摸或悬停可查看价位区间与合计占比（%）。虚线如有，仅表示分布实际日期对应的模型平均成本，不与现价计算价差或划分盈亏区。</p>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>现价定位：</strong>琥珀色横条仅标识已对齐价格落入的档位，不代表盈亏或操作建议。定位通过同股票、日期、数据版本及前复权锚点匹配的样本映射，把当前收盘价换算到分布价位口径；缺少有效映射、记录不匹配或区间不存在时不高亮，也不吸附到最近档。原平均成本虚线仍保留自己的数值与颜色。</p>
            <p>分布与成本各自保留实际数据日期。缺少真实报价时显示“筹码成本 —”；数据接口明确返回空记录时显示“筹码分布暂无记录”，请求失败或记录异常则显示“筹码分布加载失败”，可由本卡手动重试。成功分布继续复用缓存，失败不按成功结果长时间缓存；已有同股票、同源版本的有效分布不因刷新失败而被清空。不前向填充历史曲线，不据此认定与日K复权基准一致。底部两键只切换图表，不影响筛选、报价、连续天数或收藏。</p>
          </div>}
          {(notice === "average" || notice === "chip-cost") && <div className="space-y-1 border-t pt-2 text-[11px] leading-[1.75]" style={{ color: AI_STOCK_THEME.muted, borderColor: AI_STOCK_THEME.border }}>
            <p><strong style={{ color: AI_STOCK_THEME.text }}>页面注解：</strong>报价涨红跌绿；淡绿卡底仅标识符合当前加权均价条件。股票名称下的小方格，一格代表一个已确认连续收盘符合的交易日，并非连续上涨；≥表示已知下限。较长序列在固定高度内横向查看，不把一格换算成多天。</p>
            {!canFavorite && <p>登录后可使用个人本机收藏。</p>}
            <p>当前仅提供盘后数据，非实时行情；刷新不启动后台采集。</p>
            <p>仅供信息参考，不构成投资建议。</p>
          </div>}
          <button type="button" onClick={() => setNotice(null)} className="min-h-10 rounded-xl text-sm font-medium" style={{ background: AI_STOCK_THEME.accentSoft, color: AI_STOCK_THEME.accent }}>知道了</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StockTrackerMonitor() {
  return <StockMAMonitor homeMode />;
}
