const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 北京时间15:00之前截止昨天；15:00及之后截止今天。只使用UTC方法，不依赖服务器TZ。 */
export function getAShareCompletedCutoff(now: Date = new Date()): string {
  const beijing = new Date(now.getTime() + BEIJING_OFFSET_MS);
  if (!Number.isFinite(beijing.getTime())) throw new RangeError('Invalid current date');
  const cutoff = beijing.getUTCHours() < 15
    ? new Date(beijing.getTime() - DAY_MS)
    : beijing;
  return cutoff.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Tushare的YYYYMMDD真实日历日期；不将空值、溢出日期或其他格式转换成交易日。 */
export function isValidAShareTradeDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{7}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/** 只保留来源实际提供的已完成日线，同日只取第一行；不生成周末、停牌或尚未发布的行。 */
export function filterAShareCompletedRows<T>(
  rows: readonly T[],
  readTradeDate: (row: T) => unknown,
  cutoff: string,
): T[] {
  if (!isValidAShareTradeDate(cutoff)) return [];
  const seen = new Set<string>();
  return rows.filter(row => {
    const date = readTradeDate(row);
    if (!isValidAShareTradeDate(date) || date > cutoff || seen.has(date)) return false;
    seen.add(date);
    return true;
  });
}

/** completedThroughDate是实际计入的最新trade_date，不是请求日或理论截止日。 */
export function summarizeAShareCompletedDays(
  rows: readonly { tradeDate: unknown; pctChange: unknown }[],
  cutoff: string,
) {
  const completedRows = filterAShareCompletedRows(rows, row => row.tradeDate, cutoff);
  let upDays = 0, downDays = 0, flatDays = 0;
  let completedThroughDate: string | null = null;
  for (const row of completedRows) {
    const date = row.tradeDate as string;
    if (completedThroughDate === null || date > completedThroughDate) completedThroughDate = date;
    const pct = Number(row.pctChange) || 0;
    if (pct > 0) upDays++;
    else if (pct < 0) downDays++;
    else flatDays++;
  }
  const totalDays = completedRows.length;
  return {
    upDays,
    downDays,
    flatDays,
    totalDays,
    upRate: totalDays > 0 ? ((upDays / totalDays) * 100).toFixed(2) : '0.00',
    completedTradingDays: totalDays,
    completedThroughDate,
    updatedAt: completedThroughDate === null ? null
      : `${completedThroughDate.slice(0, 4)}-${completedThroughDate.slice(4, 6)}-${completedThroughDate.slice(6, 8)}`,
  };
}
