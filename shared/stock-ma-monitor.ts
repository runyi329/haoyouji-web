export type StockMAMonitorMarket = "all" | "SH" | "SZ" | "GEM" | "STAR";
export type StockMAMonitorPeriod = 5 | 10 | 20 | 30 | 60 | 120 | 250;
export type StockMAMonitorSort = "newest" | "longest" | "code";
export type StockMAMonitorBoard = Exclude<StockMAMonitorMarket, "all">;

export type StockMAMonitorPreset = "short" | "medium" | "long";
/** 每条按窗口真实成交额/成交股数计算，不是供应商直接返回的普通MA。 */
export const STOCK_MA_MONITOR_PRESETS: Record<StockMAMonitorPreset, {
  label: string;
  periods: readonly [StockMAMonitorPeriod, StockMAMonitorPeriod, StockMAMonitorPeriod];
}> = {
  short: { label: "短线", periods: [5, 10, 20] },
  medium: { label: "中线", periods: [20, 30, 60] },
  long: { label: "长线", periods: [60, 120, 250] },
};
export const STOCK_MA_MONITOR_PERIODS: readonly StockMAMonitorPeriod[] = [5, 10, 20, 30, 60, 120, 250];

export interface StockMAMonitorInput {
  ledgerId?: number;
  market: StockMAMonitorMarket;
  markets?: StockMAMonitorBoard[];
  periods: StockMAMonitorPeriod[];
  page: number;
  pageSize: number;
  sort: StockMAMonitorSort;
}

/** 原始未复权日K；成交均价统一为元/股，不是持有人真实成本。 */
export interface StockMAMonitorCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  averages: Partial<Record<StockMAMonitorPeriod, number>>;
  /** 仅展示合成，不替代私有三线筛选。 */
  compositeAverage?: number | null;
  chipAverageCost?: number | null;
}

export type StockMonitorChipStatus = "ready" | "missing" | "unknown_basis" | "incompatible_basis" | "version_mismatch";
export interface StockMAMonitorChartInput {
  ledgerId?: number;
  tsCode: string;
  periods: StockMAMonitorPeriod[];
  asOf: string;
  sourceVersion: string;
}
export interface StockMAMonitorDisplayCandle extends StockMAMonitorCandle {
  compositeAverage: number | null;
  chipAverageCost: number | null;
  chipStatus: StockMonitorChipStatus;
}
/** 最近已发布的供应商原始模型值，只作单值展示，不自动叠图或计算价差。 */
export interface StockLatestChipCost {
  value: number | null;
  asOf: string | null;
  source: "Tushare cyq_perf.weight_avg";
  estimated: true;
  status: "current" | "previous" | "cached" | "missing";
  fetchedAt: string;
}
export interface StockMAMonitorChartResult {
  tsCode: string;
  periods: StockMAMonitorPeriod[];
  asOf: string;
  sourceVersion: string;
  priceBasis: "qfq" | "unadjusted";
  anchorDate: string | null;
  chartStatus: "ready" | "unavailable";
  candles: StockMAMonitorDisplayCandle[];
  chipStatus: StockMonitorChipStatus;
  chipAsOf: string | null;
  compositeAverage: number | null;
  chipAverageCost: number | null;
  /** 仅具体股票日期的自动样本核对，不代表供应商全局复权规则确认。 */
  chipVerification?: "sample";
  latestChipCost?: StockLatestChipCost;
  fetchedAt: string;
  note: string;
}
export interface StockChipDistributionResult {
  tsCode: string;
  sourceVersion: string;
  asOf: string | null;
  source: "Tushare cyq_chips";
  estimated: true;
  status: "ready" | "missing" | "unavailable";
  points: { price: number; percent: number }[];
  weightAvg: number | null;
  latestChipCost: StockLatestChipCost;
  fetchedAt: string;
  note: string;
}

export interface StockMAMonitorItem {
  tsCode: string;
  name: string;
  close: number;
  changePercent: number | null;
  /** 截至asOf的连续收盘符合交易日；左边界未找到时为已知下限。 */
  consecutiveDays: number;
  consecutiveIsLowerBound: boolean;
  qualifiedSince: string;
  averages: Partial<Record<StockMAMonitorPeriod, number>>;
  candles: StockMAMonitorCandle[];
}

export interface StockMAMonitorResult {
  market: StockMAMonitorMarket;
  markets?: StockMAMonitorBoard[];
  periods: StockMAMonitorPeriod[];
  page: number;
  pageSize: number;
  sort: StockMAMonitorSort;
  asOf: string | null;
  dataUpdatedAt: string | null;
  fetchedAt: string;
  /** 行情内容版本供独立展示图表校验，不能混用其他快照。 */
  sourceVersion?: string;
  /** 当前板块中有效可判断的股票数；非全市场完整性保证。 */
  eligibleCount: number;
  excludedCount: number;
  total: number;
  items: StockMAMonitorItem[];
  method: "amount-volume-weighted";
  mode: "close-confirmed";
  coverageNote: string;
}
