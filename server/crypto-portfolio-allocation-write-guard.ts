import { CRYPTO_PORTFOLIO_POLICY_VERSION, getCryptoPortfolioEffectiveDate,
  latestCryptoPortfolioSnapshotDate } from '../shared/crypto-portfolio-policy';
import { isCryptoPortfolioSymbol } from '../shared/portfolio-instruments';
import { isStockSessionDate, shiftStockSessionDate } from '../shared/stock-market-session';

export const CRYPTO_ALLOCATION_HISTORY_PENDING = '15:05快照尚未完成，暂不能修改已有分配，请待快照完成后重试';
const reject = (): never => { throw new Error(CRYPTO_ALLOCATION_HISTORY_PENDING); };
const missingTable = (error: any) => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;

type WriteScope = { ledgerId: number; categoryId: number; lotId: number; symbol: string; hasExistingConfiguration: boolean };
const record = (value: any): boolean => !!value && typeof value === 'object' && !Array.isArray(value);
function savedProof(row: any, scope: WriteScope, latest: string): boolean {
  if (Number(row.ledger_id) !== scope.ledgerId || Number(row.category_id) !== scope.categoryId
    || row.policy_version !== CRYPTO_PORTFOLIO_POLICY_VERSION || !isStockSessionDate(row.snapshot_date)
    || !isStockSessionDate(row.activation_date) || row.activation_date > row.snapshot_date || row.snapshot_date > latest) return false;
  let payload: any;
  try { payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload; } catch { return false; }
  const snapshot = (value: any) => record(value) && value.ready === true && value.snapshotDate === row.snapshot_date
    && value.policyVersion === CRYPTO_PORTFOLIO_POLICY_VERSION;
  return record(payload) && payload.ledgerId === scope.ledgerId && payload.categoryId === scope.categoryId
    && payload.policyVersion === row.policy_version && payload.snapshotDate === row.snapshot_date
    && payload.activationDate === row.activation_date && payload.total?.scope === 'tag-total' && snapshot(payload.total)
    && record(payload.members) && record(payload.observations)
    && Object.values(payload.members).every(snapshot) && Object.values(payload.observations).every(snapshot);
}

/**
 * Call only inside the existing lot-lock transaction, before the first write. SELECT only.
 * Returns a recheck for immediately before commit: if an awaited write straddles 15:05,
 * missing newly-due evidence aborts/rolls back the entire existing transaction.
 * No caller-provided clock, automatic table creation, history writes or lookback limit.
 */
export async function guardCryptoPortfolioAllocationWrite(conn: any, scope: WriteScope): Promise<() => Promise<void>> {
  if (scope.ledgerId !== 37) reject();
  const [sources] = await conn.execute(`SELECT l.id,l.ledger_id,l.category_id,l.symbol,
    DATE_FORMAT(e.settlement_effective_date,'%Y-%m-%d') AS effective_date,
    DATE_FORMAT(e.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at,
    DATE_FORMAT(e.server_registered_at,'%Y-%m-%d %H:%i:%s') AS registered_at
    FROM ledger_stock_lots l INNER JOIN ledger_stock_events e ON e.id=l.opened_event_id
      AND e.ledger_id=l.ledger_id AND e.category_id=l.category_id AND e.status='active'
    WHERE l.ledger_id=? AND l.category_id=? AND l.symbol LIKE 'CRYPTO:%-USDT'`, [scope.ledgerId, scope.categoryId]);
  const sourceDates: string[] = [];
  for (const row of sources) {
    if (Number(row.ledger_id) !== scope.ledgerId || Number(row.category_id) !== scope.categoryId
      || !isCryptoPortfolioSymbol(row.symbol) || !isStockSessionDate(row.effective_date)) reject();
    try { if (row.effective_date !== getCryptoPortfolioEffectiveDate(row.actual_traded_at, row.registered_at)) reject(); }
    catch { reject(); }
    sourceDates.push(row.effective_date);
  }
  const target = sources.find((row: any) => Number(row.id) === scope.lotId && row.symbol === scope.symbol);
  // A missing/malformed source for a crypto target is never evidence of a stock-only tag.
  if (isCryptoPortfolioSymbol(scope.symbol) && !target) reject();
  let checkedLatest: string | null = null;
  const check = async () => {
    while (true) {
      const latest = latestCryptoPortfolioSnapshotDate(new Date());
      if (latest === checkedLatest) return;
      let saved: any[];
      try {
        // Qualify the indexed DATE column: the formatted alias would filesort the wide JSON payload.
        [saved] = await conn.execute(`SELECT ledger_id,category_id,policy_version,
          DATE_FORMAT(snapshot_date,'%Y-%m-%d') AS snapshot_date,
          DATE_FORMAT(activation_date,'%Y-%m-%d') AS activation_date,payload
          FROM ledger_crypto_portfolio_daily_snapshots
          WHERE ledger_id=? AND category_id=? AND policy_version=? AND snapshot_date<=?
          ORDER BY ledger_crypto_portfolio_daily_snapshots.snapshot_date ASC`, [scope.ledgerId, scope.categoryId, CRYPTO_PORTFOLIO_POLICY_VERSION, latest]);
      } catch (error) {
        // Optional new table: pure stocks stay compatible; any crypto source fails closed.
        if (!missingTable(error)) throw error;
        if (sources.length || isCryptoPortfolioSymbol(scope.symbol)) reject();
        saved = [];
      }
      if (saved.some(row => !savedProof(row, scope, latest))) reject();
      const dates = [...sourceDates, ...saved.map(row => row.activation_date)].sort();
      const activation = dates[0];
      // Only a genuinely new, not-yet-effective crypto lot cannot alter any old day.
      const newFutureLot = !scope.hasExistingConfiguration && !!target && target.effective_date > latest;
      if (activation && activation <= latest && !newFutureLot) {
        const published = new Set(saved.map(row => row.snapshot_date));
        for (let date = activation; date <= latest; date = shiftStockSessionDate(date, 1)) {
          if (!published.has(date)) reject();
        }
      }
      // The SELECT itself may have crossed cutoff. Re-read before allowing any write.
      if (latestCryptoPortfolioSnapshotDate(new Date()) !== latest) continue;
      checkedLatest = latest;
      return;
    }
  };
  await check();
  return check;
}
