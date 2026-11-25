/** R1 sale FX is immutable per sell event, never reconstructed by a read or from history. */
export const STOCK_SALE_FX_LEDGER_ID = 37;
export const STOCK_SALE_FX_CATEGORY_ID = 90250;
export type StockSaleFxCurrency = 'CNY' | 'USD' | 'USDT';
export type StockSaleFxLockKind = 'existing_baseline' | 'sale';
export type StockSaleFxLock = {
  eventId: number;
  ledgerId: number;
  categoryId: number;
  currency: StockSaleFxCurrency;
  cnyRate: number;
  quoteAsOf: string;
  lockedAt: string;
  source: string;
  lockKind: StockSaleFxLockKind;
};
export type StockSaleFxQuote = {
  rate: number;
  asOf: string;
  source: string;
  pair: string;
  stale: boolean;
};

export function isR1StockSaleFxScope(ledgerId: number, categoryId: number): boolean {
  return ledgerId === STOCK_SALE_FX_LEDGER_ID && categoryId === STOCK_SALE_FX_CATEGORY_ID;
}

const validTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const validRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100;

/** The persisted currency must match the instrument exactly, including USD versus USDT. */
export function validateStockSaleFxLock(value: unknown, expected?: {
  eventId?: number; ledgerId?: number; categoryId?: number; currency?: StockSaleFxCurrency;
}): value is StockSaleFxLock {
  if (!value || typeof value !== 'object') return false;
  const lock = value as StockSaleFxLock;
  return Number.isSafeInteger(lock.eventId) && lock.eventId > 0
    && isR1StockSaleFxScope(lock.ledgerId, lock.categoryId)
    && ['CNY', 'USD', 'USDT'].includes(lock.currency)
    && validRate(lock.cnyRate) && (lock.currency !== 'CNY' || lock.cnyRate === 1)
    && validTimestamp(lock.quoteAsOf) && validTimestamp(lock.lockedAt)
    && Date.parse(lock.quoteAsOf) <= Date.parse(lock.lockedAt) + 5_000
    && typeof lock.source === 'string' && lock.source.trim().length > 0 && lock.source.length <= 80
    && ['existing_baseline', 'sale'].includes(lock.lockKind)
    && (expected?.eventId === undefined || expected.eventId === lock.eventId)
    && (expected?.ledgerId === undefined || expected.ledgerId === lock.ledgerId)
    && (expected?.categoryId === undefined || expected.categoryId === lock.categoryId)
    && (expected?.currency === undefined || expected.currency === lock.currency);
}

/** Pure: use ONE supplied current quote for a baseline; never fetch or look up historical FX here. */
export function buildStockSaleFxLock(input: {
  eventId: number; ledgerId: number; categoryId: number; currency: StockSaleFxCurrency;
  quote?: StockSaleFxQuote | null; lockedAt: string; lockKind?: StockSaleFxLockKind;
}): StockSaleFxLock {
  const { quote, currency } = input;
  if (currency !== 'CNY' && (!quote || quote.stale !== false || quote.pair !== 'USD/CNY'
    || !validRate(quote.rate) || !validTimestamp(quote.asOf))) {
    throw new Error('无法取得有效的登记时USD/CNY汇率，卖出未保存，请稍后重试');
  }
  // USD and USDT share the project's current USD quote source, not their currency identity.
  const lock: StockSaleFxLock = {
    eventId: input.eventId, ledgerId: input.ledgerId, categoryId: input.categoryId, currency,
    cnyRate: currency === 'CNY' ? 1 : quote!.rate,
    quoteAsOf: currency === 'CNY' ? input.lockedAt : quote!.asOf,
    lockedAt: input.lockedAt, source: currency === 'CNY' ? 'cny_identity' : quote!.source,
    lockKind: input.lockKind ?? 'sale',
  };
  if (!validateStockSaleFxLock(lock)) throw new Error('卖出锁汇记录无效，未保存');
  return lock;
}

export type FrozenStockSaleAmount = {
  eventId: number;
  currency: StockSaleFxCurrency;
  buyValue: number;
  sellValue: number;
  realizedPnl: number;
  lock?: StockSaleFxLock | null;
};

/** Pure: aggregate each closure/allocation at ITS sell-event rate, never the latest lot rate.
 * Missing foreign evidence propagates null. Empty totals and intrinsic CNY require no live FX.
 */
export function aggregateFrozenStockSaleAmounts(rows: readonly FrozenStockSaleAmount[]) {
  let buyValueCny = 0;
  let sellValueCny = 0;
  let realizedPnlCny = 0;
  let fxLocked = true;
  const rates = new Set<number>();
  const lockTimes: string[] = [];
  for (const row of rows) {
    const validLock = validateStockSaleFxLock(row.lock, { eventId: row.eventId, currency: row.currency });
    const rate = validLock ? row.lock!.cnyRate : row.currency === 'CNY' ? 1 : null;
    if (rate === null || ![row.buyValue, row.sellValue, row.realizedPnl].every(Number.isFinite)) {
      fxLocked = false;
      continue;
    }
    rates.add(rate);
    if (validLock) lockTimes.push(row.lock!.lockedAt);
    buyValueCny += row.buyValue * rate;
    sellValueCny += row.sellValue * rate;
    realizedPnlCny += row.realizedPnl * rate;
  }
  return {
    buyValueCny: fxLocked ? buyValueCny : null,
    sellValueCny: fxLocked ? sellValueCny : null,
    realizedPnlCny: fxLocked ? realizedPnlCny : null,
    fxLocked,
    // Mixed-rate lots do not pretend that their latest sale rate applied to all closures.
    fxRate: fxLocked && rates.size === 1 ? Array.from(rates)[0] : null,
    fxLockedAt: fxLocked && lockTimes.length > 0
      ? lockTimes.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1)! : null,
  };
}

export async function ensureStockSaleFxLocksTable(conn: any): Promise<void> {
  await conn.execute(`CREATE TABLE IF NOT EXISTS ledger_stock_sale_fx_locks (
    event_id BIGINT NOT NULL PRIMARY KEY,
    ledger_id INT NOT NULL,
    category_id INT NOT NULL,
    currency VARCHAR(4) NOT NULL,
    cny_rate DECIMAL(16,8) NOT NULL,
    quote_as_of DATETIME(3) NOT NULL,
    locked_at DATETIME(3) NOT NULL,
    source VARCHAR(80) NOT NULL,
    lock_kind ENUM('existing_baseline','sale') NOT NULL,
    INDEX idx_stock_sale_fx_scope (ledger_id, category_id, currency)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function mysqlBeijingTimestamp(iso: string): string {
  return new Date(Date.parse(iso) + 8 * 60 * 60_000).toISOString().slice(0, 23).replace('T', ' ');
}
function storedTimestamp(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim().replace(' ', 'T');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw) ? `${raw}+08:00` : raw;
}

/** SELECT-only and connection-local: do not permanently cache a missing table across migration. */
export async function readStockSaleFxLocks(conn: any, input: {
  ledgerId: number; categoryId: number; eventIds: readonly number[];
}): Promise<Map<number, StockSaleFxLock>> {
  const locks = new Map<number, StockSaleFxLock>();
  if (!isR1StockSaleFxScope(input.ledgerId, input.categoryId) || input.eventIds.length === 0) return locks;
  const eventIds = Array.from(new Set(input.eventIds.filter(id => Number.isSafeInteger(id) && id > 0)));
  if (eventIds.length === 0) return locks;
  const [tableRows] = await conn.execute(`SELECT TABLE_NAME FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'ledger_stock_sale_fx_locks' LIMIT 1`);
  if (!(tableRows as any[]).length) return locks;
  const [rows] = await conn.execute(`SELECT event_id, ledger_id, category_id, currency, cny_rate,
      DATE_FORMAT(quote_as_of, '%Y-%m-%d %H:%i:%s.%f') AS quote_as_of,
      DATE_FORMAT(locked_at, '%Y-%m-%d %H:%i:%s.%f') AS locked_at, source, lock_kind
    FROM ledger_stock_sale_fx_locks WHERE ledger_id = ? AND category_id = ?
      AND event_id IN (${eventIds.map(() => '?').join(',')})`, [input.ledgerId, input.categoryId, ...eventIds]);
  for (const row of rows as any[]) {
    const lock: StockSaleFxLock = {
      eventId: Number(row.event_id), ledgerId: Number(row.ledger_id), categoryId: Number(row.category_id),
      currency: row.currency, cnyRate: Number(row.cny_rate), quoteAsOf: storedTimestamp(row.quote_as_of),
      lockedAt: storedTimestamp(row.locked_at), source: row.source, lockKind: row.lock_kind,
    };
    if (validateStockSaleFxLock(lock, { ledgerId: input.ledgerId, categoryId: input.categoryId })
      && eventIds.includes(lock.eventId)) locks.set(lock.eventId, lock);
  }
  return locks;
}

/** Append-only; caller owns the transaction, DDL, and explicit baseline authorization.
 * A duplicate event is an error rather than an upsert that could revalue a previous sale.
 */
export async function insertStockSaleFxLock(conn: any, lock: StockSaleFxLock): Promise<void> {
  if (!validateStockSaleFxLock(lock)) throw new Error('卖出锁汇记录无效，未保存');
  await conn.execute(`INSERT INTO ledger_stock_sale_fx_locks
    (event_id, ledger_id, category_id, currency, cny_rate, quote_as_of, locked_at, source, lock_kind)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [lock.eventId, lock.ledgerId, lock.categoryId, lock.currency,
    lock.cnyRate, mysqlBeijingTimestamp(lock.quoteAsOf), mysqlBeijingTimestamp(lock.lockedAt), lock.source, lock.lockKind]);
}

/** Corrections retain the original rate, evidence, lock time and kind, including baseline locks. */
export async function inheritStockSaleFxLock(conn: any, input: {
  eventId: number; originalEventId: number; ledgerId: number; categoryId: number; currency: StockSaleFxCurrency;
}): Promise<void> {
  const original = (await readStockSaleFxLocks(conn, { ...input, eventIds: [input.originalEventId] })).get(input.originalEventId);
  if (!validateStockSaleFxLock(original, { eventId: input.originalEventId, ledgerId: input.ledgerId,
    categoryId: input.categoryId, currency: input.currency })) {
    if (input.currency !== 'CNY') throw new Error('原卖出缺少有效的冻结汇率，请先完成既有记录基准锁定再更正');
    await insertStockSaleFxLock(conn, buildStockSaleFxLock({ ...input, lockedAt: new Date().toISOString() }));
    return;
  }
  await insertStockSaleFxLock(conn, { ...original!, eventId: input.eventId });
}
