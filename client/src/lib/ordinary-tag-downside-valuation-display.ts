/** Server-computed ordinary downside results only; never transforms real balances or cash flows. */
export type OrdinaryDownsidePoint = {
  date: string;
  balance: number | null;
  countedBalance: number | null;
  pnl: number | null;
  dailyPnl: number | null;
  rawPnl: number | null;
  capitalChange: number;
  withdrawToDate: number;
  capitalChangeToday: number;
  withdrawToday: number;
  ruleVersion?: number | null;
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
