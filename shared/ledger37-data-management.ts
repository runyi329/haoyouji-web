export type Ledger37DataPoint = { date: string; totalPnl: number | null; dailyPnl: number | null };
export type Ledger37DataTag = {
  categoryId: number; name: string; accountingMode: 'manual_balance' | 'stock_portfolio';
  startDate: string | null; status: 'active' | 'paused' | 'ended' | 'pending';
  pausePeriods?: Array<{ pauseDate: string; resumeDate?: string }>;
  totalPnl: number | null; asOf: string | null; dailyPnl: number | null; dailyDate: string | null;
  notice: string | null; points: Ledger37DataPoint[];
};
export type Ledger37DataMember = {
  userId: number; username: string; displayName: string; avatar: string | null;
  startDate: string | null; tagCount: number; totalPnl: number | null;
  verifiedSubtotal: number | null; pendingTagNames: string[]; asOfDates: string[];
  latestDailyPnl: number | null; dailyDate: string | null; dailyPendingCount: number;
  dailyVerifiedSubtotal?: number | null; dailyAsOf?: string | null;
  tags: Ledger37DataTag[];
};
export type Ledger37DataManagementResult = {
  ledgerId: 37; canEdit: boolean; page: number; pageSize: number; totalMembers: number;
  members: Ledger37DataMember[]; checkedAt: string;
};
export function ledger37TagParticipatesOnDate(tag: Ledger37DataTag, date: string): boolean {
  return (!tag.startDate || tag.startDate <= date)
    && !(tag.pausePeriods ?? []).some(period => date > period.pauseDate && (!period.resumeDate || date < period.resumeDate));
}
export function ledger37DataDailyRows(tags: Ledger37DataTag[]) {
  const dates = Array.from(new Set(tags.flatMap(tag => tag.points.map(point => point.date)))).sort().reverse();
  return dates.map(date => {
    const parts = tags.filter(tag => ledger37TagParticipatesOnDate(tag, date)).map(tag => {
      const matches = tag.points.filter(point => point.date === date);
      return { categoryId: tag.categoryId, name: tag.name, point: matches.length === 1 ? matches[0] : undefined };
    });
    const known = parts.filter(part => part.point?.dailyPnl !== null && part.point?.dailyPnl !== undefined && Number.isFinite(part.point.dailyPnl));
    const pending = parts.length - known.length;
    const amount = known.reduce((sum, part) => sum + part.point!.dailyPnl!, 0);
    return { date, parts, pending, amount: pending || !parts.length || !Number.isFinite(amount) ? null : amount,
      verifiedSubtotal: known.length && Number.isFinite(amount) ? amount : null };
  }).filter(row => row.parts.length > 0);
}
export function ledger37DataManagementPath(userId?: number): string {
  return '/ledger/37/data-management' + (userId ? `?userId=${userId}` : '');
}
export function ledger37MemberConfigPath(userId: number): string {
  return `/ledger/37/aa-initial-balance?view=user&userId=${userId}&from=data-management`;
}
