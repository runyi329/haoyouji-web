export const MIDANIANG_ANNUAL_MONTHS = 12 as const;

/** 只计算计划日期，不连接数据库或安排定时任务。now 由调用方传入。 */
export function getMidaniangAnnualShipDates(now: Date): string[] {
  if (Number.isNaN(now.getTime())) throw new Error("全年计划基准日期无效");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const baseYear = value("year");
  const baseMonth = value("month");
  const baseDay = value("day");
  if (![baseYear, baseMonth, baseDay].every(Number.isInteger)) {
    throw new Error("全年计划北京时间日期无效");
  }

  return Array.from({ length: MIDANIANG_ANNUAL_MONTHS }, (_, index) => {
    // 每期都从首月基准日计算；2月夹紧不会令3月继续沿用2月的短日期。
    const monthIndex = baseYear * 12 + baseMonth - 1 + index;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    // UTC仅用于计算目标公历月的天数，不把北京时间日期转换为UTC日期。
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(baseDay, lastDay);
    return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}
