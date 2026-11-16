import { isStockSessionDate, shiftStockSessionDate } from './stock-market-session';

export const CRYPTO_PORTFOLIO_POLICY_VERSION = 'mixed-crypto-natural-day-1505-v1';
export const CRYPTO_PORTFOLIO_CUTOFF_TIME = '15:05:00';
const DAY_MS = 86_400_000;
const BEIJING_MS = 8 * 60 * 60 * 1000;

export function cryptoPortfolioCutoffAt(date: string): Date {
  if (!isStockSessionDate(date)) throw new Error('数字币日结日期无效');
  return new Date(`${date}T${CRYPTO_PORTFOLIO_CUTOFF_TIME}+08:00`);
}
export function cryptoPortfolioBeijingDate(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error('数字币时间无效');
  return new Date(now.getTime() + BEIJING_MS).toISOString().slice(0, 10);
}
export function parsePortfolioTradeTime(value: string | Date): Date {
  if (value instanceof Date) return new Date(value);
  const raw = String(value ?? '').trim();
  // MySQL实际成交时间存北京时间墙上时刻；不按服务器或浏览器本地时区推断。
  const mysql = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw);
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw);
  if ((!mysql && !zoned) || !isStockSessionDate(raw.slice(0, 10))
    || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d/.test(raw.slice(11))) throw new Error('数字币实际成交时间无效');
  return new Date(mysql ? `${raw.replace(' ', 'T')}+08:00` : raw);
}
/** 截止区间为[前日15:05,本日15:05)，恰在15:05及以后成交归下一自然日。 */
export function getCryptoPortfolioTradeSettlementDate(value: string | Date): string {
  const instant = parsePortfolioTradeTime(value);
  const date = cryptoPortfolioBeijingDate(instant);
  return instant.getTime() >= cryptoPortfolioCutoffAt(date).getTime() ? shiftStockSessionDate(date, 1) : date;
}
/** 晚登记保留实际时间，但最早从登记时尚未固定的日结开始，不能倒改已固定格子。 */
export function getCryptoPortfolioEffectiveDate(actual: string | Date, registeredAt: string | Date): string {
  const actualDate = getCryptoPortfolioTradeSettlementDate(actual);
  const registrationDate = getCryptoPortfolioTradeSettlementDate(registeredAt);
  return actualDate > registrationDate ? actualDate : registrationDate;
}
export function latestCryptoPortfolioSnapshotDate(now = new Date()): string {
  const date = cryptoPortfolioBeijingDate(now);
  return now.getTime() >= cryptoPortfolioCutoffAt(date).getTime() ? date : shiftStockSessionDate(date, -1);
}
export function cryptoPortfolioCandidateDates(now = new Date(), lookbackDays = 3): string[] {
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 14) throw new Error('数字币日结补跑窗口无效');
  const latest = latestCryptoPortfolioSnapshotDate(now);
  return Array.from({ length: lookbackDays }, (_, i) => shiftStockSessionDate(latest, i - lookbackDays + 1));
}
export function millisecondsUntilNextCryptoPortfolioClose(now = new Date()): number {
  const date = cryptoPortfolioBeijingDate(now);
  const cutoff = cryptoPortfolioCutoffAt(date).getTime();
  return Math.max(1_000, (cutoff > now.getTime() ? cutoff : cutoff + DAY_MS) - now.getTime());
}
export function cryptoPortfolioPublicationVersion(date: string): string {
  if (!isStockSessionDate(date)) throw new Error('数字币日结日期无效');
  return `${CRYPTO_PORTFOLIO_POLICY_VERSION}:${date}`;
}
