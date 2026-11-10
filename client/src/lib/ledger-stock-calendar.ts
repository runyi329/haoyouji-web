// 只处理接口返回的只读日结数据；不获取报价、不改变成员盈亏方向。
import { getUnifiedStockCloseSnapshotDate, isUnifiedStockCloseReady } from '@shared/stock-unified-close-policy';

export type StockCalendarPoint = {
  date: string;
  totalPnl: number | null;
  dailyPnl: number | null;
  marketValue: number | null;
  previousDate: string | null;
  usdCnyRate?: number | null;
  stockDailyPnl?: number | null;
  fxDailyPnl?: number | null;
  fxAsOf?: string | null;
  fxSource?: string | null;
  fxLockedAt?: string | null;
};

export function nullableStockNumber(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function stockDateKey(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function normalizeStockCalendarPoints(
  rows: readonly Record<string, any>[],
  source: 'member' | 'total',
  previousTradingDate?: (date: string) => string,
  now = new Date(),
): StockCalendarPoint[] {
  const chronological = rows.filter((row) => {
    if (!row || !stockDateKey(source === 'member' ? row.date : row.snapshotDate)) return false;
    if (!isUnifiedStockCloseReady(source === 'member' ? row.date : row.snapshotDate, now)) return false;
    if (row.historical === false) return false;
    // 旧接口没有 historical 标记时，剔除首次盘尾前追加的空市值占位。
    // 有明确 historical 标记的缺价历史日保留，用于展示“待更新”而非消失。
    return row.historical === true || source === 'total' || nullableStockNumber(row.marketValue) !== null;
  }).sort((left, right) => String(source === 'member' ? left.date : left.snapshotDate)
    .localeCompare(String(source === 'member' ? right.date : right.snapshotDate)));

  return chronological.map((row, index) => {
    const date = stockDateKey(source === 'member' ? row.date : row.snapshotDate)!;
    const totalPnl = row.priced === false ? null : nullableStockNumber(source === 'member' ? row.pnl : row.totalPnl);
    const previous = chronological[index - 1];
    const previousDate = 'previousDate' in row
      ? stockDateKey(row.previousDate)
      : previous ? stockDateKey(source === 'member' ? previous.date : previous.snapshotDate) : null;
    let dailyPnl = row.priced === false ? null : nullableStockNumber(row.dailyPnl);
    // 个人点的日收益严格信任 nullable 契约；总盘旧快照无 dailyPnl 时才允许
    // 从完整、相邻交易日推算，缺价/跨日断档绝不以 0 基准伪造“当日”收益。
    if (source === 'total' && !('dailyPnl' in row) && row.priced !== false) {
      const previousPnl = previous?.priced === false ? null : nullableStockNumber(previous?.totalPnl);
      dailyPnl = totalPnl !== null && previousPnl !== null && previousDate
        && previousTradingDate?.(date) === previousDate ? totalPnl - previousPnl : null;
    }
    if (previousDate && previousTradingDate && previousDate !== previousTradingDate(date)) dailyPnl = null;
    return {
      date, totalPnl, dailyPnl, previousDate,
      marketValue: row.priced === false ? null : nullableStockNumber(row.marketValue),
      ...('usdCnyRate' in row ? {
        usdCnyRate: nullableStockNumber(row.usdCnyRate),
        stockDailyPnl: row.priced === false ? null : nullableStockNumber(row.stockDailyPnl),
        fxDailyPnl: row.priced === false ? null : nullableStockNumber(row.fxDailyPnl),
        fxAsOf: typeof row.fxAsOf === 'string' ? row.fxAsOf : null,
        fxSource: typeof row.fxSource === 'string' ? row.fxSource : null,
        fxLockedAt: typeof row.fxLockedAt === 'string' ? row.fxLockedAt : null,
      } : {}),
    };
  });
}

// 仅统计已知日收益；整个区间未知时返回 null，避免将“无数据”表示成 0。
export function sumKnownStockDailyPnl(points: readonly StockCalendarPoint[]): number | null {
  const known = points.filter((point) => point.dailyPnl !== null);
  return known.length ? known.reduce((sum, point) => sum + point.dailyPnl!, 0) : null;
}

export function stockCalendarScope(hasPersonalOverview: boolean, canViewTotal: boolean, overviewReady: boolean) {
  if (!overviewReady) return 'loading' as const;
  if (hasPersonalOverview) return 'member' as const;
  return canViewTotal ? 'total' as const : 'missing' as const;
}

// 时间仅决定预期归属日，不证明真实行情齐备；调用方仍须有已发布的对应日点。
export function expectedStockSettlementDate(isNonTradingDate: (date: string) => boolean, now = new Date()): string {
  let date = getUnifiedStockCloseSnapshotDate(now);
  for (let index = 0; index < 30 && isNonTradingDate(date); index++) {
    const previous = new Date(`${date}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    date = previous.toISOString().slice(0, 10);
  }
  return date;
}
