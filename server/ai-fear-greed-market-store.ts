import type { AiFearGreedDailyRow } from '../shared/ai-fear-greed-market';

export const AI_FEAR_GREED_MARKET_SOURCE = 'tushare_daily' as const;
export const AI_FEAR_GREED_MARKET_UNIVERSE = 'shu-sz-a-share-v1' as const;

/** Explicit opt-in DDL only: importing this module never executes SQL. */
export const AI_FEAR_GREED_MARKET_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS ai_fear_greed_market_daily (
  trade_date CHAR(8) NOT NULL,
  raw_count INT NOT NULL,
  valid_count INT NOT NULL,
  up_count INT NOT NULL,
  down_count INT NOT NULL,
  up_amount DECIMAL(24,6) NOT NULL,
  down_amount DECIMAL(24,6) NOT NULL,
  total_amount DECIMAL(24,6) NOT NULL,
  mean_return DECIMAL(20,12) NULL,
  source VARCHAR(32) NOT NULL,
  source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_rows INT NOT NULL,
  universe VARCHAR(64) NOT NULL,
  verified_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (trade_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

/** mysql2-compatible injection; caller owns its connection, no db imports. */
type Executor = {
  execute(sql: string, parameters: unknown[]): Promise<unknown>;
};

const MAX_INT = 2147483647;
const ZERO_HASH = '0'.repeat(64);

function integer(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INT) {
    throw new Error(`${label} must be a non-negative SQL INT`);
  }
}

function decimal(value: number, scale: number, limit: number, label: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= limit) {
    throw new Error(`${label} is outside its finite SQL DECIMAL range`);
  }
  const rounded = value.toFixed(scale);
  if (Math.abs(Number(rounded)) >= limit) throw new Error(`${label} rounds outside SQL DECIMAL range`);
  return rounded;
}

function sourceDay(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('canonicaldate must be strict YYYY-MM-DD');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('canonicaldate is not a real calendar date');
  }
  return value.replace(/-/g, '');
}

/**
 * Store only verified, method-independent full-source market aggregates.
 * An official-calendar pending row (zero hash, NULL verification) can be replaced;
 * same-hash writes can refresh verification. A different already-verified hash
 * is a conflict, even if its aggregation happens to match (conservative v1).
 *
 * The conditional UPSERT is atomic: concurrent different hashes cannot overwrite
 * each other. Metrics precede hash, then source, then verification. Pending stays
 * eligible until promoted; afterward the same-hash branch remains eligible.
 * A read-back distinguishes a rejected no-op from a same-second idempotent write
 * without depending on mysql2 affectedRows / CLIENT_FOUND_ROWS configuration.
 * Requires a mysql2-style [rows, metadata] execute result for that read-back.
 * This function does not create the table, open a connection, or run on import.
 */
export async function writeAiFearGreedMarketDay(
  executor: Executor,
  row: AiFearGreedDailyRow,
  sourceHash: string,
  sourceRows: number,
): Promise<void> {
  const tradeDate = sourceDay(row.canonicaldate);
  for (const key of ['rawCount', 'validCount', 'upCount', 'downCount'] as const) integer(row[key], key);
  integer(sourceRows, 'sourceRows');
  if (row.rawCount < 3000 || sourceRows < row.rawCount || row.validCount > row.rawCount || row.upCount + row.downCount > row.validCount) {
    throw new Error('Inconsistent counts or incomplete full-source market day');
  }
  if (typeof sourceHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(sourceHash) || sourceHash === ZERO_HASH) {
    throw new Error('sourceHash must be a non-zero SHA-256 hex digest of the source response');
  }
  const hash = sourceHash.toLowerCase();
  const amounts = [row.upAmount, row.downAmount, row.totalAmount];
  if (amounts.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error('Amounts must be non-negative finite numbers (never null)');
  }
  const tolerance = Math.max(1e-6, row.totalAmount * Number.EPSILON * 16);
  if (row.upAmount + row.downAmount - row.totalAmount > tolerance ||
      (row.upCount === 0 ? row.upAmount !== 0 : row.upAmount <= 0) ||
      (row.downCount === 0 ? row.downAmount !== 0 : row.downAmount <= 0) ||
      (row.validCount === 0 ? row.totalAmount !== 0 || row.meanReturn !== null : row.totalAmount <= 0 || row.meanReturn === null)) {
    throw new Error('Inconsistent direction amounts, validCount or meanReturn');
  }
  const up = decimal(row.upAmount, 6, 1e18, 'upAmount');
  const down = decimal(row.downAmount, 6, 1e18, 'downAmount');
  const total = decimal(row.totalAmount, 6, 1e18, 'totalAmount');
  const mean = row.meanReturn === null ? null : decimal(row.meanReturn, 12, 1e8, 'meanReturn');

  // VALUES() works on the project's MySQL 8 (deprecated in newer 8.0, not removed).
  // Pending acceptance is intentionally narrow: not a personal/user cache.
  const accepted = `(universe = VALUES(universe) AND (
    (source = 'pending' AND verified_at IS NULL)
    OR (source = VALUES(source) AND source_hash = VALUES(source_hash))
  ))`;
  const metricColumns = ['raw_count', 'valid_count', 'up_count', 'down_count', 'up_amount', 'down_amount', 'total_amount', 'mean_return', 'source_rows'];
  const updates = metricColumns.map(column => `${column} = IF(${accepted}, VALUES(${column}), ${column})`);
  // MySQL evaluates assignments in order. Changing hash while still pending
  // leaves the pending branch true; changing source then enables same-hash.
  updates.push(`source_hash = IF(${accepted}, VALUES(source_hash), source_hash)`);
  updates.push(`source = IF(${accepted}, VALUES(source), source)`);
  updates.push(`verified_at = IF(${accepted}, NOW(), verified_at)`);
  await executor.execute(`INSERT INTO ai_fear_greed_market_daily (
    trade_date, raw_count, valid_count, up_count, down_count,
    up_amount, down_amount, total_amount, mean_return,
    source, source_hash, source_rows, universe, verified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  ON DUPLICATE KEY UPDATE ${updates.join(',\n    ')}`, [
    tradeDate, row.rawCount, row.validCount, row.upCount, row.downCount,
    up, down, total, mean,
    AI_FEAR_GREED_MARKET_SOURCE, hash, sourceRows, AI_FEAR_GREED_MARKET_UNIVERSE,
  ]);

  const result = await executor.execute(`SELECT source, source_hash, universe, verified_at
    FROM ai_fear_greed_market_daily WHERE trade_date = ? LIMIT 1`, [tradeDate]);
  const rows = Array.isArray(result) ? result[0] : undefined;
  const stored = Array.isArray(rows) && rows.length === 1 ? rows[0] as Record<string, unknown> : undefined;
  if (!stored || stored.source !== AI_FEAR_GREED_MARKET_SOURCE || stored.source_hash !== hash ||
      stored.universe !== AI_FEAR_GREED_MARKET_UNIVERSE || stored.verified_at == null) {
    throw new Error(`Market daily source conflict or unverified write for ${tradeDate}; existing verified source was not overwritten`);
  }
}
