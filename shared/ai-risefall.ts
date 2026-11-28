export type AiRisefallMarket = 'all' | 'SH' | 'SZ' | 'GEM' | 'STAR';
export type AiRisefallStatus = 'available' | 'partial' | 'insufficient' | 'unavailable';
/** 每个桶计数为交易日数，指标是每日上涨股票数 / 当日有效股票总数。
 * 固定标签：<30%, 30~40%, 40~50%, 50~60%, 60~70%, >70%。
 * 中间桶左闭右开，60~70%包含70%，末桶严格大于70%。 */
export type AiRisefallDistribution = { label: string; count: number };
export type AiRisefallPeriod = {
  label: string;
  /** 窗口内真实且有效的交易日数，可能不足 requestedDays。 */
  total: number;
  requestedDays: number;
  /** 实际窗口首末日期，YYYY-MM-DD；无有效日时为null。 */
  windowStart: string | null;
  windowEnd: string | null;
  distribution: AiRisefallDistribution[];
};
export type AiRisefallToday = {
  /** 只计close/pre_close均有效的在市A股。 */
  total: number;
  up: number;
  down: number;
  flat: number;
  /** 当日精确总数，仅供应商完整且所有有效股票均核验时可用；否则null。 */
  limit_up: number | null;
  limit_down: number | null;
  max_rise: number | null;
  max_fall: number | null;
  /** 同一市场/日期scope内缺失或非正close/pre_close行数。 */
  excluded: number;
  limitEvaluated: number;
  limitUnknown: number;
};
export type AiRisefallResult = {
  /** 最新实际有效交易日，YYYY-MM-DD。 */
  latestDate: string | null;
  status: AiRisefallStatus;
  source: 'daily';
  today: AiRisefallToday | null;
  periods: AiRisefallPeriod[];
};
// BJ仅内部市场，包含在all中，不扩大前端市场选项。
export const AI_RISEFALL_MARKETS: readonly Exclude<AiRisefallMarket, 'all'>[] = ['SH', 'SZ', 'GEM', 'STAR'];
