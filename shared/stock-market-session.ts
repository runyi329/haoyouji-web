/**
 * 股票市场日期契约（纯函数，无数据库、报价请求或定时器）。
 * 沿用既有 NYSE 常规休市计算与 2026 A 股休市表；不扩大日历覆盖范围。
 * 日期为交易所本地 YYYY-MM-DD；US 日期始终是纽约交易日，不能改写行情归属日期。
 */
export type StockMarket = 'A' | 'US';
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_LOOKBACK_DAYS = 40;

export function isStockSessionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftStockSessionDate(date: string, days: number): string {
  if (!isStockSessionDate(date) || !Number.isInteger(days)) throw new Error('无效的股票会话日期或天数');
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function weekday(date: string): number { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
function nthWeekday(year: number, month: number, day: number, nth: number): string {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  return shiftStockSessionDate(first, ((day - weekday(first) + 7) % 7) + (nth - 1) * 7);
}
function observed(date: string): string {
  return weekday(date) === 6 ? shiftStockSessionDate(date, -1) : weekday(date) === 0 ? shiftStockSessionDate(date, 1) : date;
}
function usHolidays(year: number): Set<string> {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const mayEnd = `${year}-05-31`;
  return new Set([
    // NYSE does not observe Saturday New Year's Day on the preceding Friday.
    ...(weekday(`${year}-01-01`) === 6 ? [] : [observed(`${year}-01-01`)]),
    nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3), shiftStockSessionDate(easter, -2),
    shiftStockSessionDate(mayEnd, -((weekday(mayEnd) - 1 + 7) % 7)),
    observed(`${year}-06-19`), observed(`${year}-07-04`), nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4), observed(`${year}-12-25`),
  ]);
}
const A_CLOSED_2026 = [
  ['2026-01-01', '2026-01-03'], ['2026-02-15', '2026-02-23'],
  ['2026-04-04', '2026-04-06'], ['2026-05-01', '2026-05-05'],
  ['2026-06-19', '2026-06-21'], ['2026-09-25', '2026-09-27'], ['2026-10-01', '2026-10-07'],
];

export function isStockMarketSession(date: string, market: StockMarket): boolean {
  if (!isStockSessionDate(date) || weekday(date) === 0 || weekday(date) === 6) return false;
  if (market === 'US') return !usHolidays(Number(date.slice(0, 4))).has(date);
  if (market === 'A') return !A_CLOSED_2026.some(([start, end]) => date >= start && date <= end);
  return false;
}

/** 返回严格早于 date 的最近该市场交易日；最多回查40个自然日，找不到则null。 */
export function previousStockMarketSession(date: string, market: StockMarket): string | null {
  if (!isStockSessionDate(date)) return null;
  for (let offset = 1; offset <= SESSION_LOOKBACK_DAYS; offset++) {
    const candidate = shiftStockSessionDate(date, -offset);
    if (isStockMarketSession(candidate, market)) return candidate;
  }
  return null;
}

/**
 * A 股日结D使用此前已收盘的最近纽约交易日，严格 US日期 < D。
 * 当天夜间美股留到下一个A股交易日；A股长假期间的US变动只累计到下一A日估值差。
 */
export function getOvernightUsSessionDate(aDay: string): string | null {
  return isStockMarketSession(aDay, 'A') ? previousStockMarketSession(aDay, 'US') : null;
}
