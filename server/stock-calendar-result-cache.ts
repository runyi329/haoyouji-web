import { gzipSync, gunzipSync } from 'node:zlib';
import { getDbConnection, getDbTransactionConnection } from './db';
import { getUnifiedStockCloseVersion, getUnifiedStockCloseSnapshotDate, UNIFIED_STOCK_CLOSE_POLICY_VERSION } from '../shared/stock-unified-close-policy';
import type { TotalCalendarSnapshot } from './shared/stock-total-calendar';

/** Derived results only: no funds guard, wallet, distributions, source quotes or FX writes. */
export const STOCK_CALENDAR_RESULT_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ledger_stock_calendar_results (
  ledger_id INT NOT NULL,
  category_id INT NOT NULL,
  policy_version VARCHAR(80) NOT NULL,
  generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
  computed_generation BIGINT UNSIGNED NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  settlement_version VARCHAR(100) NULL,
  latest_settlement_date DATE NULL,
  computed_at DATETIME(3) NULL COMMENT 'UTC',
  payload_encoding VARCHAR(16) NOT NULL DEFAULT 'gzip-base64',
  payload LONGTEXT NULL,
  PRIMARY KEY (ledger_id, category_id, policy_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const LEDGER_ID = 37;
const POLICY = UNIFIED_STOCK_CLOSE_POLICY_VERSION;
const metadataColumns = `CAST(generation AS CHAR) AS generation, CAST(computed_generation AS CHAR) AS computed_generation,
  CAST(revision AS CHAR) AS revision, settlement_version,
  DATE_FORMAT(latest_settlement_date,'%Y-%m-%d') AS latest_settlement_date,
  DATE_FORMAT(computed_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS computed_at`;
const keyParams = (categoryId: number) => [LEDGER_ID, categoryId, POLICY];
const memory = new Map<number, { revision: string; payload: TotalCalendarSnapshot[] }>();
const flights = new Map<number, Promise<StockCalendarRebuildResult>>();
let tableReady: Promise<void> | null = null;

function validateCategory(categoryId: number) {
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new Error('股票日历标签编号无效');
}
function missingTable(error: any): boolean {
  return error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
}
export function encodeStockCalendarResult(payload: readonly TotalCalendarSnapshot[]): string {
  return gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64');
}
export function decodeStockCalendarResult(encoded: string, encoding = 'gzip-base64'): TotalCalendarSnapshot[] {
  const json = encoding === 'gzip-base64' ? gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')
    : encoding === 'json' ? encoded : (() => { throw new Error('未知股票日历缓存编码'); })();
  const payload = JSON.parse(json);
  // Preserve every ready and unready row, including all null amounts and provenance.
  if (!Array.isArray(payload) || payload.some(row => !row || row.scope !== 'tag-total'
    || typeof row.snapshotDate !== 'string' || typeof row.ready !== 'boolean')) {
    throw new Error('股票日历派生结果无效');
  }
  return payload;
}

/** Explicit background/write migration only. Never invoked by readStockCalendarResult. */
export async function ensureStockCalendarResultTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const conn = await getDbConnection();
      if (!conn) throw new Error('数据库连接不可用');
      await (conn as any).execute(STOCK_CALENDAR_RESULT_TABLE_DDL);
    })().catch(error => { tableReady = null; throw error; });
  }
  await tableReady;
}

/** Must be awaited inside the same source-write transaction, before commit; never deletes history. */
export async function markStockCalendarResultDirty(conn: any, categoryId: number): Promise<void> {
  validateCategory(categoryId);
  await conn.execute(`INSERT INTO ledger_stock_calendar_results (ledger_id,category_id,policy_version,generation)
    VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE generation=generation+1`, keyParams(categoryId));
}

/** SELECT-only hot path. Always check persisted revision; dirty/next-day results remain readable. */
export async function readStockCalendarResult(categoryId: number): Promise<TotalCalendarSnapshot[]> {
  validateCategory(categoryId);
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接不可用');
  let rows: any[];
  try {
    [rows] = await (conn as any).execute(`SELECT ${metadataColumns} FROM ledger_stock_calendar_results
      WHERE ledger_id=? AND category_id=? AND policy_version=? LIMIT 1`, keyParams(categoryId));
  } catch (error) {
    if (missingTable(error)) return memory.get(categoryId)?.payload ?? [];
    throw error;
  }
  const meta = rows[0];
  if (!meta?.computed_at) return memory.get(categoryId)?.payload ?? [];
  const cached = memory.get(categoryId);
  if (cached?.revision === String(meta.revision)) return cached.payload;
  const [payloadRows] = await (conn as any).execute(`SELECT ${metadataColumns},payload,payload_encoding
    FROM ledger_stock_calendar_results WHERE ledger_id=? AND category_id=? AND policy_version=? LIMIT 1`, keyParams(categoryId));
  const row = (payloadRows as any[])[0];
  if (!row?.payload) return cached?.payload ?? [];
  try {
    const payload = decodeStockCalendarResult(String(row.payload), String(row.payload_encoding));
    memory.set(categoryId, { revision: String(row.revision), payload });
    return payload;
  } catch (error) {
    console.error(`[37股票日历] ${categoryId} 派生结果读取失败，保留上一版`, error);
    return cached?.payload ?? [];
  }
}

export type StockCalendarRebuildResult = {
  categoryId: number;
  saved: boolean;
  status: 'saved' | 'up-to-date' | 'busy' | 'superseded';
  revision?: string;
  latestSettlementDate?: string | null;
  computedAt?: string | null;
};
type Calculate = (conn: any, now: Date) => Promise<TotalCalendarSnapshot[]>;
export function isStockCalendarResultCurrent(meta: any, settlementVersion: string): boolean {
  return !!meta?.computed_at && meta.computed_generation != null
    && String(meta.computed_generation) === String(meta.generation)
    && meta.settlement_version === settlementVersion;
}

/** Process singleflight + MySQL named lock + atomic generation CAS, with bounded stale retries. */
export function rebuildCachedStockCalendarResult(input: {
  categoryId: number; now?: Date; force?: boolean; calculate: Calculate;
}): Promise<StockCalendarRebuildResult> {
  validateCategory(input.categoryId);
  const existing = flights.get(input.categoryId);
  if (existing) return existing;
  const promise = rebuild(input).finally(() => { if (flights.get(input.categoryId) === promise) flights.delete(input.categoryId); });
  flights.set(input.categoryId, promise);
  return promise;
}

async function rebuild(input: { categoryId: number; now?: Date; force?: boolean; calculate: Calculate }): Promise<StockCalendarRebuildResult> {
  const { categoryId } = input;
  const now = input.now ?? new Date();
  const settlementVersion = getUnifiedStockCloseVersion(getUnifiedStockCloseSnapshotDate(now));
  await ensureStockCalendarResultTable();
  const tx: any = await getDbTransactionConnection();
  if (!tx) throw new Error('数据库事务连接不可用');
  const lockName = `stock37-calendar:${categoryId}:${POLICY}`;
  let locked = false, inTransaction = false;
  try {
    const [lockRows] = await tx.execute('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
    locked = Number(lockRows[0]?.acquired) === 1;
    if (!locked) return { categoryId, saved: false, status: 'busy' };
    await tx.execute(`INSERT IGNORE INTO ledger_stock_calendar_results (ledger_id,category_id,policy_version) VALUES (?,?,?)`, keyParams(categoryId));
    for (let attempt = 0; attempt < 3; attempt++) {
      // The first consistent SELECT anchors generation and all source reads to one snapshot.
      await tx.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await tx.beginTransaction(); inTransaction = true;
      const [rows] = await tx.execute(`SELECT ${metadataColumns} FROM ledger_stock_calendar_results
        WHERE ledger_id=? AND category_id=? AND policy_version=?`, keyParams(categoryId));
      const meta = rows[0];
      if (!input.force && isStockCalendarResultCurrent(meta, settlementVersion)) {
        await tx.commit(); inTransaction = false;
        return { categoryId, saved: false, status: 'up-to-date', revision: String(meta.revision),
          latestSettlementDate: meta.latest_settlement_date, computedAt: meta.computed_at };
      }
      const payload = await input.calculate(tx, now);
      await tx.commit(); inTransaction = false;
      const encoded = encodeStockCalendarResult(payload);
      const latestSettlementDate = payload.filter(row => row.ready).map(row => row.snapshotDate).sort().at(-1) ?? null;
      const computedAt = new Date().toISOString();
      await tx.beginTransaction(); inTransaction = true;
      const [saved] = await tx.execute(`UPDATE ledger_stock_calendar_results SET
        computed_generation=?, revision=revision+1, settlement_version=?, latest_settlement_date=?,
        computed_at=?, payload_encoding='gzip-base64', payload=?
        WHERE ledger_id=? AND category_id=? AND policy_version=? AND generation=?`,
      [String(meta.generation), settlementVersion, latestSettlementDate, computedAt.slice(0, 23).replace('T', ' '),
        encoded, ...keyParams(categoryId), String(meta.generation)]);
      await tx.commit(); inTransaction = false;
      if (Number(saved.affectedRows) !== 1) continue;
      const [freshRows] = await tx.execute(`SELECT ${metadataColumns} FROM ledger_stock_calendar_results
        WHERE ledger_id=? AND category_id=? AND policy_version=?`, keyParams(categoryId));
      const fresh = freshRows[0];
      if (!isStockCalendarResultCurrent(fresh, settlementVersion)) continue;
      memory.set(categoryId, { revision: String(fresh.revision), payload });
      console.log(`[37股票日历] ${categoryId} 派生结果已保存 revision=${fresh.revision}, rows=${payload.length}, latest=${latestSettlementDate ?? 'pending'}`);
      return { categoryId, saved: true, status: 'saved', revision: String(fresh.revision), latestSettlementDate, computedAt };
    }
    return { categoryId, saved: false, status: 'superseded' };
  } finally {
    try {
      if (inTransaction) await tx.rollback();
    } finally {
      try { if (locked) await tx.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
      finally { if (typeof tx.release === 'function') tx.release(); }
    }
  }
}
