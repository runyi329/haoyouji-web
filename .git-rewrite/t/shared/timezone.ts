/**
 * 北京时区工具函数
 * 统一处理时区转换，确保前端显示和后端统计都使用北京时间（UTC+8）
 */

// 北京时区偏移量（毫秒）
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 获取当前北京时间的 Date 对象
 */
export function getBeijingNow(): Date {
  const now = new Date();
  const utcTime = now.getTime();
  const beijingTime = utcTime + BEIJING_OFFSET_MS;
  return new Date(beijingTime);
}

/**
 * 获取当前北京时间的时间戳（毫秒）
 */
export function getBeijingTimestamp(): number {
  return Date.now() + BEIJING_OFFSET_MS;
}

/**
 * 将 UTC 时间戳转换为北京时间的 Date 对象
 */
export function utcToBeijing(utcTimestamp: number): Date {
  return new Date(utcTimestamp + BEIJING_OFFSET_MS);
}

/**
 * 将北京时间的 Date 对象转换为 UTC 时间戳
 */
export function beijingToUtc(beijingDate: Date): number {
  return beijingDate.getTime() - BEIJING_OFFSET_MS;
}

/**
 * 获取北京时间今天的开始时间（00:00:00）
 * @returns UTC 时间戳
 */
export function getBeijingTodayStart(): number {
  const beijingNow = getBeijingTimestamp();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const beijingStartOfDay = Math.floor(beijingNow / oneDayMs) * oneDayMs;
  return beijingStartOfDay - BEIJING_OFFSET_MS; // 转回 UTC
}

/**
 * 获取北京时间今天的结束时间（23:59:59.999）
 * @returns UTC 时间戳
 */
export function getBeijingTodayEnd(): number {
  return getBeijingTodayStart() + 24 * 60 * 60 * 1000 - 1;
}

/**
 * 获取北京时间本周的开始时间（周一 00:00:00）
 * @returns UTC 时间戳
 */
export function getBeijingThisWeekStart(): number {
  const beijingNow = new Date(getBeijingTimestamp());
  const dayOfWeek = beijingNow.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 计算距离周一的天数
  
  const beijingMondayStart = new Date(beijingNow);
  beijingMondayStart.setUTCDate(beijingMondayStart.getUTCDate() - daysToMonday);
  beijingMondayStart.setUTCHours(0, 0, 0, 0);
  
  return beijingMondayStart.getTime() - BEIJING_OFFSET_MS; // 转回 UTC
}

/**
 * 获取北京时间本月的开始时间（1号 00:00:00）
 * @returns UTC 时间戳
 */
export function getBeijingThisMonthStart(): number {
  const beijingNow = new Date(getBeijingTimestamp());
  const beijingMonthStart = new Date(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), 1, 0, 0, 0, 0);
  
  return beijingMonthStart.getTime() - BEIJING_OFFSET_MS; // 转回 UTC
}

/**
 * 获取北京时间本年的开始时间（1月1日 00:00:00）
 * @returns UTC 时间戳
 */
export function getBeijingThisYearStart(): number {
  const beijingNow = new Date(getBeijingTimestamp());
  const beijingYearStart = new Date(beijingNow.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
  
  return beijingYearStart.getTime() - BEIJING_OFFSET_MS; // 转回 UTC
}

/**
 * 格式化北京时间为字符串
 * @param utcTimestamp UTC 时间戳
 * @param format 格式：'date' | 'datetime' | 'time'
 */
export function formatBeijingTime(utcTimestamp: number, format: 'date' | 'datetime' | 'time' = 'datetime'): string {
  const beijingDate = utcToBeijing(utcTimestamp);
  
  const year = beijingDate.getUTCFullYear();
  const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingDate.getUTCDate()).padStart(2, '0');
  const hours = String(beijingDate.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(beijingDate.getUTCSeconds()).padStart(2, '0');
  
  if (format === 'date') {
    return `${year}-${month}-${day}`;
  } else if (format === 'time') {
    return `${hours}:${minutes}:${seconds}`;
  } else {
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

/**
 * 计算两个时间戳之间相差的天数（基于北京时间）
 */
export function calculateBeijingDaysDifference(timestamp1: number, timestamp2: number): number {
  const beijingTime1 = timestamp1 + BEIJING_OFFSET_MS;
  const beijingTime2 = timestamp2 + BEIJING_OFFSET_MS;
  
  const oneDayMs = 24 * 60 * 60 * 1000;
  const day1 = Math.floor(beijingTime1 / oneDayMs);
  const day2 = Math.floor(beijingTime2 / oneDayMs);
  
  return Math.abs(day2 - day1);
}
