import { isCryptoPortfolioCalendarPoint, nullableStockNumber, stockDateKey } from './ledger-stock-calendar';

// Read-only presentation: never fetch prices, inspect current positions or calculate official closes.
type Metadata = Record<string, any>;
export type StockOverviewSettlementDisplay = {
  expectedDate: string;
  usesCryptoPolicy: boolean;
  confirmedTotalPnl: number | null;
  confirmedAsOf: string | null;
  dailyPnl: number | null;
  dailyDate: string | null;
  dailyPoint: Metadata | null;
  cumulativeNote: string;
  cumulativeTitle: string;
  dailyTitle: string;
};
const dateOf = (row: Metadata | null | undefined) => stockDateKey(row?.snapshotDate ?? row?.date);
const totalOf = (row: Metadata) => nullableStockNumber('totalPnl' in row ? row.totalPnl : row.pnl);
function isConfirmed(row: Metadata): boolean {
  if (row.ready === false || row.priced === false || row.status === 'pending' || row.status === 'missing') return false;
  // Legacy member points have no ready flag; a finite published cumulative value is their contract.
  return Boolean(dateOf(row)) && totalOf(row) !== null;
}
export const shortSettlementDate = (date: string) => date.slice(5).replace('-', '/');
export function formatOverviewPnl(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '--'
    : `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

export function stockOverviewSettlementDisplay(input: {
  summary?: Metadata | null;
  points?: readonly Metadata[] | null;
  expectedStockDate: string;
  expectedCryptoDate: string;
  cutoffDate?: string | null;
}): StockOverviewSettlementDisplay {
  const summary = input.summary ?? {};
  const points = input.points ?? [];
  const all = [...points, summary.latestSnapshot, summary.priorSnapshot, summary.lastConfirmedSnapshot]
    .filter((row): row is Metadata => Boolean(row && dateOf(row)))
    .filter(row => !input.cutoffDate || dateOf(row)! <= input.cutoffDate)
    .sort((a, b) => dateOf(b)!.localeCompare(dateOf(a)!));
  const policy = summary.settlementPolicy;
  const policyName = typeof policy === 'string' ? policy : policy?.policyVersion ?? policy?.version ?? policy?.kind;
  const explicitCrypto = typeof policy?.usesCryptoPolicy === 'boolean' ? policy.usesCryptoPolicy
    : typeof summary.usesCryptoPolicy === 'boolean' ? summary.usesCryptoPolicy
    : typeof policyName === 'string' ? /crypto|natural.day|mixed/i.test(policyName) : null;
  // Explicit personal policy wins over historical category-wide crypto evidence.
  const usesCryptoPolicy = explicitCrypto ?? isCryptoPortfolioCalendarPoint(all[0]);
  const expectedDate = stockDateKey(summary.expectedDate ?? policy?.expectedDate)
    ?? (usesCryptoPolicy ? input.expectedCryptoDate : input.expectedStockDate);
  const candidates = all.filter(isConfirmed).map(row => ({ date: dateOf(row)!, total: totalOf(row)! }));
  const metadataDate = stockDateKey(summary.confirmedAsOf);
  const metadataTotal = nullableStockNumber(summary.confirmedTotalPnl);
  if (metadataDate && metadataTotal !== null && (!input.cutoffDate || metadataDate <= input.cutoffDate)) {
    candidates.unshift({ date: metadataDate, total: metadataTotal });
  }
  // Old summary contract: only accept a finite value with a confirmed date, never a pending latest.
  const valuationDate = stockDateKey(summary.valuationDate);
  const summaryTotal = nullableStockNumber(summary.totalPnl);
  if (valuationDate && summaryTotal !== null && (!input.cutoffDate || valuationDate <= input.cutoffDate)
    && !all.some(row => dateOf(row) === valuationDate && !isConfirmed(row))) {
    candidates.push({ date: valuationDate, total: summaryTotal });
  }
  candidates.sort((a, b) => b.date.localeCompare(a.date));
  const confirmed = candidates[0] ?? null;
  const expectedPoints = all.filter(row => dateOf(row) === expectedDate);
  const dailyPoint = expectedPoints.find(row => isConfirmed(row) && row.dailyPnlReady !== false
    && nullableStockNumber('dailyPnl' in row ? row.dailyPnl : row.stockDailyPnl) !== null) ?? null;
  let dailyPnl = dailyPoint ? nullableStockNumber('dailyPnl' in dailyPoint ? dailyPoint.dailyPnl : dailyPoint.stockDailyPnl) : null;
  if (!dailyPoint && expectedPoints.length === 0 && !input.cutoffDate && summary.dailyChangeReady === true
    && stockDateKey(summary.dailyChangeDate) === expectedDate) dailyPnl = nullableStockNumber(summary.dailyChange);
  const confirmedAsOf = confirmed?.date ?? null;
  const confirmedTotalPnl = confirmed?.total ?? null;
  const basis = usesCryptoPolicy ? '个人混合组合自然日日结' : '个人股票最近交易日日结';
  return {
    expectedDate, usesCryptoPolicy, confirmedTotalPnl, confirmedAsOf, dailyPnl,
    dailyDate: dailyPnl === null ? null : expectedDate, dailyPoint,
    cumulativeNote: confirmedAsOf ? `截至${shortSettlementDate(confirmedAsOf)}` : '待更新',
    cumulativeTitle: confirmedAsOf
      ? `个人已确认累计回报（人民币）￥${confirmedTotalPnl!.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}，截至${confirmedAsOf}；${expectedDate}日结${dailyPnl === null ? '待更新' : '已更新'}`
      : '个人累计回报待更新，暂无有限已确认日结金额',
    dailyTitle: `${basis} ${expectedDate}，15:05日结${dailyPnl === null ? '待更新；不以旧日收益代替' : `已更新，￥${dailyPnl.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}（人民币）`,
  };
}

export function aggregateOverviewPnl(rows: readonly {
  latestPnl: number | null;
  tag: { name: string; isStockPortfolio?: boolean };
  stockDisplay?: StockOverviewSettlementDisplay | null;
}[]) {
  const missing = rows.filter(row => row.latestPnl === null || !Number.isFinite(row.latestPnl));
  const dates = Array.from(new Set(rows.flatMap(row => row.stockDisplay?.confirmedAsOf ? [row.stockDisplay.confirmedAsOf] : []))).sort();
  const note = missing.length ? '待更新' : dates.length === 1 ? `已确认${shortSettlementDate(dates[0])}` : dates.length > 1 ? '各日已确认' : '';
  const title = missing.length
    ? `累计合计待更新：${missing.map(row => row.tag.name).join('、')}回报未知，未按0计入完整合计`
    : `各行展示口径累计合计（人民币）${rows.filter(row => row.stockDisplay).map(row => `；${row.tag.name}已确认截至${row.stockDisplay!.confirmedAsOf ?? '未知'}`).join('')}，非所有标签同日实时估值`;
  return { total: missing.length ? null : rows.reduce((sum, row) => sum + row.latestPnl!, 0), missingCount: missing.length, note, title };
}
