import { isStockMarketSession, isStockSessionDate, previousStockMarketSession } from '../../../shared/stock-market-session';

type Snapshot = Readonly<Record<string, unknown>>;

export type StockTagDailyPnlRecord = {
  date: string;
  totalPnl: number | null;
  totalPnlReady: boolean;
  dailyPnl: number | null;
  dailyPnlReady: boolean;
  /** Keep the API's flags/status distinct from numeric availability. */
  ready: boolean | null;
  priced: boolean | null;
  status: string | null;
  serverDailyPnlReady: boolean | null;
  dailyPnlReason: string | null;
  previousDate: string | null;
  previousKnownEmpty: boolean | null;
  policyVersion: string | null;
  mixedNaturalDay: boolean;
  marketValue: number | null;
  costValue: number | null;
};

function finiteAmount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

const flag = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const hasDailyFields = (snapshot: Snapshot) => 'dailyPnl' in snapshot || 'dailyPnlReady' in snapshot;
const isMixed = (snapshot: Snapshot) => typeof snapshot.policyVersion === 'string'
  && snapshot.policyVersion.startsWith('mixed-crypto-natural-day-');

function totalReady(snapshot: Snapshot): boolean {
  // Explicit non-ready metadata overrides even a stale finite amount (including 0).
  return snapshot.ready !== false && snapshot.priced !== false
    && (snapshot.status == null || snapshot.status === 'ready')
    && finiteAmount(snapshot.totalPnl) !== null;
}

/** Read-only mapping: retain pending rows, never borrow a baseline across a gap. */
export function mapStockTagDailySnapshots(snapshots: readonly Snapshot[]): StockTagDailyPnlRecord[] {
  const rows = [...snapshots].sort((left, right) => String(left.snapshotDate).localeCompare(String(right.snapshotDate)));
  return rows.map((snapshot, index) => {
    const date = String(snapshot.snapshotDate);
    const totalPnl = finiteAmount(snapshot.totalPnl);
    const totalPnlReady = totalReady(snapshot);
    const mixedNaturalDay = isMixed(snapshot);
    let dailyPnl: number | null = null;

    if (hasDailyFields(snapshot)) {
      // Modern/mixed API owns baseline verification, including activation/known-empty first days.
      // Presence of null/undefined/false is NOT permission to fall back to a client difference.
      const serverReady = !('dailyPnlReady' in snapshot) || snapshot.dailyPnlReady === true;
      if (totalPnlReady && serverReady) dailyPnl = finiteAmount(snapshot.dailyPnl);
    } else if (!mixedNaturalDay && totalPnlReady && index > 0) {
      const previous = rows[index - 1];
      const expectedPrevious = isStockMarketSession(date, 'A') ? previousStockMarketSession(date, 'A') : null;
      const declaredPrevious = 'previousDate' in snapshot ? snapshot.previousDate : expectedPrevious;
      // Only the legacy stock contract supports this fallback. Both adjacent snapshots must
      // be finite/valid; never search backwards past an unready/missing trading day.
      if (!hasDailyFields(previous) && !isMixed(previous) && totalReady(previous)
        && expectedPrevious !== null && declaredPrevious === expectedPrevious
        && previous.snapshotDate === expectedPrevious) {
        dailyPnl = finiteAmount(totalPnl! - finiteAmount(previous.totalPnl)!);
      }
    }

    return {
      date, totalPnl, totalPnlReady, dailyPnl, dailyPnlReady: dailyPnl !== null,
      ready: flag(snapshot.ready), priced: flag(snapshot.priced), status: text(snapshot.status),
      serverDailyPnlReady: flag(snapshot.dailyPnlReady), dailyPnlReason: text(snapshot.dailyPnlReason),
      previousDate: isStockSessionDate(snapshot.previousDate) ? snapshot.previousDate : null,
      previousKnownEmpty: flag(snapshot.previousKnownEmpty), policyVersion: text(snapshot.policyVersion),
      mixedNaturalDay, marketValue: finiteAmount(snapshot.marketValue), costValue: finiteAmount(snapshot.costValue),
    };
  });
}
