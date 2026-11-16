import type { MemberCalendarSnapshot } from './stock-member-calendar';
import { cryptoPortfolioCutoffAt } from '../../shared/crypto-portfolio-policy';
import { isStockSessionDate } from '../../shared/stock-market-session';

/** 只拼接已保存结果，不获取报价、不重新解释旧证券历史。返回时间正序。 */
export function mergeCryptoPortfolioCalendarSnapshots<T extends { snapshotDate: string }, U extends MemberCalendarSnapshot>(
  legacy: readonly T[], crypto: readonly U[], activationDate: string | null, now = new Date(),
): Array<T | U> {
  if (!activationDate) return [...Array.from(legacy)].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  if (!isStockSessionDate(activationDate)) throw new Error('数字币策略激活日无效');
  const byDate = new Map<string, T | U>();
  for (const row of Array.from(legacy)) if (isStockSessionDate(row.snapshotDate) && row.snapshotDate < activationDate) byDate.set(row.snapshotDate, row);
  for (const row of Array.from(crypto)) {
    if (!isStockSessionDate(row.snapshotDate) || row.snapshotDate < activationDate
      || cryptoPortfolioCutoffAt(row.snapshotDate).getTime() > now.getTime()) continue;
    byDate.set(row.snapshotDate, row);
  }
  return [...Array.from(byDate.values())].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
}
