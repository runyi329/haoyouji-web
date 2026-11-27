/** Server-computed ordinary downside results only; never transforms real balances or cash flows. */
export type OrdinaryDownsidePoint = {
  date: string;
  balance: number | null;
  pnl: number | null;
  dailyPnl: number | null;
  capitalChange: number;
  withdrawToDate: number;
  capitalChangeToday: number;
  withdrawToday: number;
};
export type OrdinaryDownsideCategory = {
  categoryId: number;
  categoryName: string;
  status: 'ready' | 'pending' | 'no_data';
  points: OrdinaryDownsidePoint[];
  latestDate: string | null;
  totalPnl: number | null;
  todayPnl: number | null;
};
export type OrdinaryDownsideResponse = { ledgerId: number; categories: OrdinaryDownsideCategory[] };
export type OrdinaryDownsideScope = OrdinaryDownsideCategory & {
  latestPoint: OrdinaryDownsidePoint | undefined;
  pointByDate: Map<string, OrdinaryDownsidePoint>;
};

export function nullableOrdinaryNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 值模式比较真实账户余额，不使用个人收益、强平折算值或格式化后的万元数。 */
export function ordinaryCalendarBalanceColor(scope: OrdinaryDownsideScope, date: string, startDate = ''): string {
  const balance = nullableOrdinaryNumber(scope.pointByDate.get(date)?.balance);
  if (balance === null) return '#9E9E9E';
  const dates = Array.from(scope.pointByDate.keys()).sort();
  const index = dates.indexOf(date);
  if (index === 0 || date === startDate) return '#222222';
  if (index < 0) return '#9E9E9E';
  const previous = nullableOrdinaryNumber(scope.pointByDate.get(dates[index - 1])?.balance);
  if (previous === null) return '#9E9E9E';
  return balance > previous ? '#D32F2F' : balance < previous ? '#4CAF50' : '#9E9E9E';
}

/** Overview-only historical display. Never fills today's return or skips an invalid latest point. */
export function ordinaryOverviewDailyReturn(scope: OrdinaryDownsideScope, today: string): { amount: number | null; date: string | null } {
  const point = scope.latestPoint;
  if (scope.status !== 'ready' || !point || point.date > today
    || nullableOrdinaryNumber(point.balance) === null || nullableOrdinaryNumber(point.pnl) === null) {
    return { amount: null, date: null };
  }
  const amount = nullableOrdinaryNumber(point.date === today ? scope.todayPnl : point.dailyPnl);
  return { amount, date: amount === null ? null : point.date };
}

export function formatOverviewDailyReturn(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  const absolute = Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  return `${value < 0 && absolute !== '0' ? '-' : ''}${absolute}`;
}

// Keep the native tRPC key prefix: centralized endpoint.invalidate({ ledgerId: 37 })
// matches every identity, while effective user and viewAs never share cached data.
export function ordinaryDownsideIdentityQueryKey(baseKey: readonly unknown[], userId: number, effectiveUserId: number, viewAs: number | null) {
  return [...baseKey, { ordinaryDownsideIdentity: { userId, effectiveUserId, viewAs } }] as const;
}

export function buildOrdinaryDownsideScopes(
  ledgerId: number,
  visibleCategories: readonly { id: number; name: string; accountingMode?: string | null }[],
  response: OrdinaryDownsideResponse | undefined,
  isVisibleDate: (tagName: string, date: string) => boolean = () => true,
  awaitingResponse = false,
): Map<number, OrdinaryDownsideScope> {
  const scopes = new Map<number, OrdinaryDownsideScope>();
  if (ledgerId !== 37) return scopes;
  const ordinaryCategories = visibleCategories.filter(category => category.accountingMode !== 'stock_portfolio');
  // Before authorization/result is loaded, do not flash a locally recomputed raw return.
  const results = response?.ledgerId === 37 ? response.categories : awaitingResponse
    ? ordinaryCategories.map(category => ({ categoryId: category.id, categoryName: category.name,
      status: 'pending' as const, points: [], latestDate: null, totalPnl: null, todayPnl: null }))
    : [];
  for (const result of results) {
    const category = ordinaryCategories.find(item => Number(item.id) === Number(result.categoryId));
    if (!category) continue;
    const points = result.points.filter(point => isVisibleDate(category.name, point.date));
    const latestPoint = points[points.length - 1];
    const clipped = points.length !== result.points.length;
    scopes.set(Number(category.id), {
      ...result,
      points,
      latestPoint,
      pointByDate: new Map(points.map(point => [point.date, point])),
      latestDate: latestPoint?.date ?? null,
      totalPnl: result.status === 'ready' && latestPoint
        ? nullableOrdinaryNumber(clipped ? latestPoint.pnl : result.totalPnl) : null,
      todayPnl: result.status === 'ready' && !clipped && latestPoint
        ? nullableOrdinaryNumber(result.todayPnl) : null,
    });
  }
  return scopes;
}

export function ordinaryDownsideChartPoints(scope: OrdinaryDownsideScope, initialBalance: number, marginCny: number) {
  return scope.points.map(point => {
    const pnl = nullableOrdinaryNumber(point.pnl);
    const capital = initialBalance + point.capitalChange;
    return { ...point, pnl,
      pctInitial: pnl === null ? null : capital > 0 ? pnl / capital * 100 : 0,
      pctMargin: pnl === null ? null : marginCny > 0 ? pnl / marginCny * 100 : 0,
    };
  });
}

export function sumOrdinaryDownsideDailyPnl(points: readonly OrdinaryDownsidePoint[]): number | null {
  if (!points.length) return null;
  let total = 0;
  for (const point of points) {
    const value = nullableOrdinaryNumber(point.dailyPnl);
    if (value === null) return null;
    total += value;
  }
  return total;
}
