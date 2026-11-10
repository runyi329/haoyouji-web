/**
 * 37号股票标签统一日结策略（纯函数；不访问数据库、不启动定时器）。
 * 北京时间每个A股交易日D 15:05：A股当天D + 此前已收盘最近纽约US交易日（严格<D）。
 * 当天夜间US放到下一个A股交易日；盘中、夜间、周末及A股假期不另建日结。
 * A股假期期间连续US交易的变动累计归下一A交易日，按相邻A日估值差统计。
 *
 * 后台契约：refreshLedgerStockTagCloseSnapshots({ snapshotDate }) 应按市场验证
 * A=D、US=getOvernightUsSessionDate(D)的真实常规收盘，再返回下列发布确认。
 * complete 只能在所有适用标签都已持久化该日期的本version后为true；
 * updated 仅表示报价数，不能作为成功标志。重试/启动补跑按日期version幂等。
 * 本政策版本用于日结publication，不改写旧行情policy_version或原始行情日期provenance。
 */
import {
  isStockMarketSession,
  isStockSessionDate,
  previousStockMarketSession,
  shiftStockSessionDate,
} from './stock-market-session';
export { isStockSessionDate, shiftStockSessionDate } from './stock-market-session';

export const UNIFIED_STOCK_CLOSE_POLICY_VERSION = 'cn-day-us-overnight-1505-v1';
export const UNIFIED_STOCK_CLOSE_BEIJING_MINUTE = 15 * 60 + 5;
export const UNIFIED_STOCK_CLOSE_RETRY_END_MINUTE = 18 * 60 + 5;
export const UNIFIED_STOCK_CLOSE_RETRY_INTERVAL_MS = 15 * 60 * 1000;
export const UNIFIED_STOCK_CLOSE_LOOKBACK_DAYS = 14;

export type UnifiedStockClosePublicationResult = {
  categories: number;
  symbols: number;
  updated: number;
  /** 仅在全部适用标签的同日期本version日结真实持久化后为true。 */
  complete?: boolean;
  publishedCategories?: number;
  /** 含已经持久化成功而被幂等跳过的标签。 */
  alreadyPublishedCategories?: number;
  /** 数据缺失、无效交易日或锁冲突等不可算成功。 */
  skippedCategories?: number;
  snapshotDate?: string;
  /** getUnifiedStockCloseVersion(D)，而非原始价格来源表的policy_version。 */
  version?: string;
};

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getUnifiedStockCloseVersion(snapshotDate: string): string {
  if (!isStockSessionDate(snapshotDate)) throw new Error('无效的股票日结归属日期');
  return `${UNIFIED_STOCK_CLOSE_POLICY_VERSION}:${snapshotDate}`;
}

export function getUnifiedStockClosePublishAt(snapshotDate: string): Date {
  if (!isStockSessionDate(snapshotDate)) throw new Error('无效的股票日结归属日期');
  return new Date(`${snapshotDate}T15:05:00+08:00`);
}

export function getBeijingStockClock(now = new Date()): { date: string; minutes: number } {
  const clock = new Date(now.getTime() + BEIJING_OFFSET_MS);
  return { date: clock.toISOString().slice(0, 10), minutes: clock.getUTCHours() * 60 + clock.getUTCMinutes() };
}

/** 返回已达到15:05发布时点的最近A股交易日；非A交易日或15:05前回退严格前一A日。 */
export function getUnifiedStockCloseSnapshotDate(now = new Date()): string {
  const clock = getBeijingStockClock(now);
  if (clock.minutes >= UNIFIED_STOCK_CLOSE_BEIJING_MINUTE && isStockMarketSession(clock.date, 'A')) return clock.date;
  const previous = previousStockMarketSession(clock.date, 'A');
  if (!previous) throw new Error('有界窗口内未找到已可发布的A股交易日');
  return previous;
}

export function isUnifiedStockCloseReady(snapshotDate: string, now = new Date()): boolean {
  return isStockMarketSession(snapshotDate, 'A') && now.getTime() >= getUnifiedStockClosePublishAt(snapshotDate).getTime();
}

/** 有界回查自然日窗口，但只返回已到15:05发布时间的A交易日，按旧到新补跑。 */
export function getUnifiedStockCloseCandidateDates(now = new Date(), lookbackDays = UNIFIED_STOCK_CLOSE_LOOKBACK_DAYS): string[] {
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 366) throw new Error('无效的股票日结补跑窗口');
  const latest = getUnifiedStockCloseSnapshotDate(now);
  return Array.from({ length: lookbackDays }, (_, index) => shiftStockSessionDate(latest, index - lookbackDays + 1))
    .filter(date => isUnifiedStockCloseReady(date, now));
}

/** 仅A交易日15:05–18:05重试同一天同一版本，不形成额外日结。 */
export function isUnifiedStockCloseRetryWindow(now = new Date()): boolean {
  const { date, minutes } = getBeijingStockClock(now);
  return isStockMarketSession(date, 'A')
    && minutes >= UNIFIED_STOCK_CLOSE_BEIJING_MINUTE
    && minutes <= UNIFIED_STOCK_CLOSE_RETRY_END_MINUTE;
}

export function millisecondsUntilNextUnifiedStockClose(now = new Date()): number {
  const { date } = getBeijingStockClock(now);
  // 有界寻找下一A交易日首试，周末/假期不另启动日结。当前15:05由首试或启动补跑负责。
  for (let offset = 0; offset <= 40; offset++) {
    const candidate = shiftStockSessionDate(date, offset);
    if (!isStockMarketSession(candidate, 'A')) continue;
    const publishAt = getUnifiedStockClosePublishAt(candidate);
    if (publishAt.getTime() > now.getTime()) return Math.max(1_000, publishAt.getTime() - now.getTime());
  }
  throw new Error('有界窗口内未找到下一A股日结发布时间');
}

/**
 * 严格校验行情API实际会话日期：expectedSessionDate必须按市场提供A=D、US最近纽约日期<D。
 * 日期别名不是归属日期改写；调用方还须证明真实常规收盘/EOD来源，禁止盘中报价。
 */
export function isUnifiedStockCloseQuoteForDate(quote: { price: number; priceDate?: string; date?: string } | null | undefined, expectedSessionDate: string): boolean {
  if (!quote || !isStockSessionDate(expectedSessionDate) || !Number.isFinite(quote.price) || quote.price <= 0) return false;
  const sessionDate = quote.priceDate || quote.date;
  if (!isStockSessionDate(sessionDate) || sessionDate !== expectedSessionDate) return false;
  // 两个日期字段冲突时，不允许任选其中一个绕过校验。
  return !quote.date || quote.date === expectedSessionDate;
}

/** 兼容旧后台返回值时采取fail-closed；旧publication版本与报价数量均不等于新口径发布完成。 */
export function isUnifiedStockClosePublicationComplete(result: UnifiedStockClosePublicationResult, snapshotDate: string): boolean {
  return isStockMarketSession(snapshotDate, 'A')
    && result.complete === true
    && result.categories > 0
    && result.snapshotDate === snapshotDate
    && result.version === getUnifiedStockCloseVersion(snapshotDate)
    && Number(result.publishedCategories || 0) + Number(result.alreadyPublishedCategories || 0) === result.categories
    && Number(result.skippedCategories || 0) === 0;
}
