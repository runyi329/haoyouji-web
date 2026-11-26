import { createStockLotDownsideVersion, countedStockLotPrice, selectStockLotDownsideRule, type StockLotDownsideRule } from '../shared/stock-lot-downside';

export const STOCK_LOT_DOWNSIDE_RULES_DDL = `CREATE TABLE IF NOT EXISTS ledger_stock_lot_downside_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, ledger_id INT NOT NULL, category_id INT NOT NULL,
  lot_id BIGINT NOT NULL, user_id INT NOT NULL, version INT NOT NULL, enabled BOOLEAN NOT NULL,
  threshold_price DECIMAL(30,12) NOT NULL, downside_percent DECIMAL(12,8) NOT NULL,
  start_date DATE NULL, effective_at DATETIME(3) NOT NULL COMMENT 'UTC business effective instant',
  baseline_raw_price DECIMAL(30,12) NULL, baseline_counted_price DECIMAL(30,12) NULL,
  baseline_status VARCHAR(12) NULL, baseline_source VARCHAR(24) NULL, holding_start_at VARCHAR(40) NULL,
  currency VARCHAR(4) NOT NULL, quote_as_of VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL COMMENT 'UTC server audit time',
  activation_mode VARCHAR(12) NULL, auto_drop_percent DECIMAL(12,8) NULL, auto_entry_price DECIMAL(30,12) NULL,
  armed_at DATETIME(3) NULL COMMENT 'UTC owner save confirmation',
  triggered_at DATETIME(3) NULL COMMENT 'UTC first scan confirmation', trigger_price DECIMAL(30,12) NULL,
  trigger_quote_as_of DATETIME(3) NULL COMMENT 'UTC actual quote observation', trigger_source VARCHAR(160) NULL,
  UNIQUE KEY uk_stock_lot_downside_version (ledger_id,category_id,lot_id,version),
  INDEX idx_stock_lot_downside_category (ledger_id,category_id,effective_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
export const STOCK_LOT_DOWNSIDE_SALES_DDL = `CREATE TABLE IF NOT EXISTS ledger_stock_lot_downside_sales (
  ledger_id INT NOT NULL, category_id INT NOT NULL, lot_id BIGINT NOT NULL, sell_event_id BIGINT NOT NULL,
  rule_version INT NOT NULL, raw_price DECIMAL(30,12) NOT NULL, counted_price DECIMAL(30,12) NOT NULL,
  effective_at DATETIME(3) NOT NULL COMMENT 'UTC actual sale time',
  captured_at DATETIME(3) NOT NULL COMMENT 'UTC server audit time',
  PRIMARY KEY (ledger_id,category_id,lot_id,sell_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
const missingTable = (e: any) => e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146;
const caches = new WeakMap<object, Map<string, { until: number; promise: Promise<StockLotDownsideRule[]> }>>();
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const utcMillisColumn = (name: string) => `CONCAT(LEFT(DATE_FORMAT(${name},'%Y-%m-%dT%H:%i:%s.%f'),23),'Z') AS ${name}`;
const columns = `ledger_id,category_id,lot_id,user_id,version,enabled,threshold_price,downside_percent,
  ${utcMillisColumn('effective_at')},
  baseline_raw_price,baseline_counted_price,currency,quote_as_of,
  ${utcMillisColumn('created_at')}`;
const dateColumns = `${columns},DATE_FORMAT(start_date,'%Y-%m-%d') AS start_date,baseline_status,baseline_source,holding_start_at`;
const autoColumns = `${dateColumns},activation_mode,auto_drop_percent,auto_entry_price,
  ${utcMillisColumn('armed_at')},${utcMillisColumn('triggered_at')},trigger_price,
  ${utcMillisColumn('trigger_quote_as_of')},trigger_source`;
const missingColumn = (e: any) => e?.code === 'ER_BAD_FIELD_ERROR' || e?.errno === 1054;
async function selectRules(conn: any, suffix: string, params: any[]) {
  try { return await conn.execute(`SELECT ${autoColumns} FROM ledger_stock_lot_downside_rules ${suffix}`, params); }
  catch (e: any) {
    if (!missingColumn(e)) throw e;
    // A named missing auto column identifies the preceding manual/date schema.
    // Unknown errors conservatively use the oldest schema; never infer auto readiness.
    const missing = String(e.sqlMessage ?? e.message);
    // A partially installed auto schema must not strip activation_mode and expose its 0% basis as manual.
    if (/auto_drop_percent|auto_entry_price|armed_at|triggered_at|trigger_price|trigger_quote_as_of|trigger_source/.test(missing)
      && !/activation_mode/.test(missing)) throw e;
    if (/activation_mode/.test(missing)) {
      try { return await conn.execute(`SELECT ${dateColumns} FROM ledger_stock_lot_downside_rules ${suffix}`, params); }
      catch (legacy) { if (!missingColumn(legacy)) throw legacy; }
    }
    return conn.execute(`SELECT ${columns} FROM ledger_stock_lot_downside_rules ${suffix}`, params);
  }
}
function decode(r: any): StockLotDownsideRule {
  return { ledgerId: Number(r.ledger_id), categoryId: Number(r.category_id), lotId: Number(r.lot_id), userId: Number(r.user_id),
    version: Number(r.version), enabled: Number(r.enabled) === 1, thresholdPrice: Number(r.threshold_price),
    downsidePercent: Number(r.downside_percent), effectiveAt: iso(r.effective_at), baselineRawPrice: r.baseline_raw_price == null ? NaN : Number(r.baseline_raw_price),
    baselineCountedPrice: r.baseline_counted_price == null ? NaN : Number(r.baseline_counted_price), currency: r.currency, quoteAsOf: r.quote_as_of ?? undefined, createdAt: iso(r.created_at),
    ...(r.start_date ? { startDate: String(r.start_date) } : {}), baselineStatus: r.baseline_status ?? undefined,
    baselineSource: r.baseline_source ?? undefined, holdingStartAt: r.holding_start_at ?? undefined,
    ...(r.activation_mode == null ? {} : { activationMode: r.activation_mode }),
    ...(r.auto_drop_percent == null ? {} : { autoDropPercent: Number(r.auto_drop_percent) }),
    ...(r.auto_entry_price == null ? {} : { autoEntryPrice: Number(r.auto_entry_price) }),
    ...(r.armed_at == null ? {} : { armedAt: iso(r.armed_at) }),
    ...(r.triggered_at == null ? {} : { triggeredAt: iso(r.triggered_at) }),
    ...(r.trigger_price == null ? {} : { triggerPrice: Number(r.trigger_price) }),
    ...(r.trigger_quote_as_of == null ? {} : { triggerQuoteAsOf: iso(r.trigger_quote_as_of) }),
    ...(r.trigger_source == null ? {} : { triggerSource: String(r.trigger_source) }) };
}
/** SELECT-only current highest version; caller locks lot then opening event first. */
export async function readLatestStockLotDownsideRuleForUpdate(conn: any, ledgerId: number, categoryId: number, lotId: number): Promise<StockLotDownsideRule | null> {
  const [rows] = await selectRules(conn, `WHERE ledger_id=? AND category_id=? AND lot_id=? ORDER BY version DESC LIMIT 1 FOR UPDATE`, [ledgerId, categoryId, lotId]);
  return rows[0] ? decode(rows[0]) : null;
}
/** SELECT-only whole-ledger batch for settings/CAS: all saved versions, no effective-time filter or cache. */
export async function readAllStockLotDownsideRules(conn: any, ledgerId: number): Promise<StockLotDownsideRule[]> {
  try {
    const [rows] = await selectRules(conn, `WHERE ledger_id=? ORDER BY category_id,lot_id,version`, [ledgerId]);
    return rows.map(decode);
  } catch (e) { if (missingTable(e)) return []; throw e; }
}
/** SELECT-only, one query per category, including negative cache. No startup/read DDL. */
export async function readStockLotDownsideRules(conn: any, ledgerId: number, categoryId: number, fresh = false): Promise<StockLotDownsideRule[]> {
  let cache = caches.get(conn); if (!cache) { cache = new Map(); caches.set(conn, cache); }
  const key = `${ledgerId}:${categoryId}`, saved = cache.get(key);
  if (!fresh && saved && saved.until > Date.now()) return saved.promise;
  const promise = (async () => {
    try {
      const [rows] = await selectRules(conn, `WHERE ledger_id=? AND category_id=? ORDER BY lot_id,version`, [ledgerId, categoryId]);
      return rows.map(decode);
    } catch (e) { if (missingTable(e)) return []; throw e; }
  })();
  cache.set(key, { until: Date.now() + 15_000, promise });
  void promise.catch(() => cache!.delete(key));
  return promise;
}
export function invalidateStockLotDownsideRuleCache(conn: any, ledgerId: number, categoryId: number) {
  caches.get(conn)?.delete(`${ledgerId}:${categoryId}`);
}
/** ONLY call after the formal save handler has passed actual-owner authorization. */
export async function ensureStockLotDownsideRulesTables(conn: any): Promise<void> {
  await conn.execute(STOCK_LOT_DOWNSIDE_RULES_DDL);
  await conn.execute(STOCK_LOT_DOWNSIDE_SALES_DDL);
  await conn.execute(STOCK_LOT_DOWNSIDE_MEMBER_EPOCHS_DDL);
  // Lazy migration only in formally authorized save, never in reads/startup.
  const [existing] = await conn.execute(`SELECT COLUMN_NAME FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='ledger_stock_lot_downside_rules'`);
  const names = new Set(existing.map((r: any) => String(r.COLUMN_NAME ?? r.column_name)));
  for (const [name, definition] of [['start_date','DATE NULL'],['baseline_status','VARCHAR(12) NULL'],
    ['baseline_source','VARCHAR(24) NULL'],['holding_start_at','VARCHAR(40) NULL'],
    ['activation_mode','VARCHAR(12) NULL'],['auto_drop_percent','DECIMAL(12,8) NULL'],['auto_entry_price','DECIMAL(30,12) NULL'],
    ['armed_at','DATETIME(3) NULL'],['triggered_at','DATETIME(3) NULL'],['trigger_price','DECIMAL(30,12) NULL'],
    ['trigger_quote_as_of','DATETIME(3) NULL'],['trigger_source','VARCHAR(160) NULL']]) {
    if (!names.has(name)) await conn.execute(`ALTER TABLE ledger_stock_lot_downside_rules ADD COLUMN ${name} ${definition}`);
  }
  await conn.execute(`ALTER TABLE ledger_stock_lot_downside_rules MODIFY baseline_raw_price DECIMAL(30,12) NULL,
    MODIFY baseline_counted_price DECIMAL(30,12) NULL`);
}
const mysqlUtc = (s: string) => new Date(s).toISOString().slice(0, 23).replace('T', ' ');
/** Caller holds the scoped lot FOR UPDATE in a transaction; unique version enforces CAS too. */
export async function appendStockLotDownsideRule(conn: any, input: Parameters<typeof createStockLotDownsideVersion>[0]): Promise<StockLotDownsideRule> {
  const [rows] = await selectRules(conn, `WHERE ledger_id=? AND category_id=? AND lot_id=? ORDER BY version DESC LIMIT 1 FOR UPDATE`,
  [input.ledgerId, input.categoryId, input.lotId]);
  const next = createStockLotDownsideVersion(input, rows[0] ? decode(rows[0]) : null);
  try {
    const values = [next.ledgerId, next.categoryId, next.lotId, next.userId, next.version, next.enabled ? 1 : 0, next.thresholdPrice,
      next.downsidePercent, mysqlUtc(next.effectiveAt), next.baselineRawPrice, next.baselineCountedPrice,
      next.currency, next.quoteAsOf ?? null, mysqlUtc(next.createdAt!)];
    const extra = next.startDate ? ',start_date,baseline_status,baseline_source,holding_start_at' : '';
    if (next.startDate) {
      values[9] = Number.isFinite(next.baselineRawPrice) ? next.baselineRawPrice : null;
      values[10] = Number.isFinite(next.baselineCountedPrice) ? next.baselineCountedPrice : null;
      values.push(next.startDate, next.baselineStatus ?? 'ready', next.baselineSource ?? null, next.holdingStartAt ?? null);
    }
    const autoExtra = next.activationMode === 'auto_drop'
      ? ',activation_mode,auto_drop_percent,auto_entry_price,armed_at,triggered_at,trigger_price,trigger_quote_as_of,trigger_source' : '';
    if (autoExtra) values.push(next.activationMode!, next.autoDropPercent!, next.autoEntryPrice!, mysqlUtc(next.armedAt!),
      next.triggeredAt ? mysqlUtc(next.triggeredAt) : null, next.triggerPrice ?? null,
      next.triggerQuoteAsOf ? mysqlUtc(next.triggerQuoteAsOf) : null, next.triggerSource ?? null);
    const [result] = await conn.execute(`INSERT INTO ledger_stock_lot_downside_rules
      (ledger_id,category_id,lot_id,user_id,version,enabled,threshold_price,downside_percent,effective_at,
       baseline_raw_price,baseline_counted_price,currency,quote_as_of,created_at${extra}${autoExtra}) VALUES (${values.map(() => '?').join(',')})`, values);
    if (Number(result.affectedRows) !== 1) throw new Error('欠保证金版本保存失败');
  } catch (e: any) { if (e?.code === 'ER_DUP_ENTRY') throw new Error('欠保证金版本冲突，请刷新后重试'); throw e; }
  return next;
}
export type StockLotDownsideSale = { lotId: number; eventId: number; version: number; rawPrice: number; countedPrice: number; effectiveAt: string };
/** Independent frozen valuation evidence; the real order and member closure prices stay untouched. */
export async function readStockLotDownsideSales(conn: any, ledgerId: number, categoryId: number): Promise<StockLotDownsideSale[]> {
  try {
    const [rows] = await conn.execute(`SELECT lot_id,sell_event_id,rule_version,raw_price,counted_price,
      DATE_FORMAT(effective_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS effective_at FROM ledger_stock_lot_downside_sales
      WHERE ledger_id=? AND category_id=?`, [ledgerId, categoryId]);
    return rows.map((r: any) => ({ lotId: Number(r.lot_id), eventId: Number(r.sell_event_id), version: Number(r.rule_version), rawPrice: Number(r.raw_price), countedPrice: Number(r.counted_price), effectiveAt: iso(r.effective_at) }));
  } catch (e) { if (missingTable(e)) return []; throw e; }
}
/** No rule means NO extra write, including old databases without these tables. */
export async function freezeStockLotDownsideSale(conn: any, input: { ledgerId: number; categoryId: number; lotId: number; eventId: number; rawPrice: number; effectiveAt: string; rules?: readonly StockLotDownsideRule[] }) {
  const rules = input.rules ?? await readStockLotDownsideRules(conn, input.ledgerId, input.categoryId, true);
  const rule = selectStockLotDownsideRule(rules, input.lotId, input.effectiveAt);
  if (!rule) return;
  const countedPrice = countedStockLotPrice(input.rawPrice, rule);
  if (countedPrice === null) throw new Error('卖出计入口径缺少历史基准证据，等待核验');
  await conn.execute(`INSERT IGNORE INTO ledger_stock_lot_downside_sales
    (ledger_id,category_id,lot_id,sell_event_id,rule_version,raw_price,counted_price,effective_at,captured_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, [input.ledgerId, input.categoryId, input.lotId, input.eventId, rule.version,
      input.rawPrice, countedPrice, mysqlUtc(input.effectiveAt), mysqlUtc(new Date().toISOString())]);
  const [saved] = await conn.execute(`SELECT counted_price,raw_price,rule_version FROM ledger_stock_lot_downside_sales
    WHERE ledger_id=? AND category_id=? AND lot_id=? AND sell_event_id=?`, [input.ledgerId, input.categoryId, input.lotId, input.eventId]);
  if (!saved[0] || Number(saved[0].raw_price) !== input.rawPrice) throw new Error('已固定欠保证金卖出真实价格冲突，禁止回改');
  // A date revision derives a new sale value at read time, never overwrites this old audit row.
  if (rule.startDate && Number(saved[0].rule_version) < rule.version) return;
  if (Math.abs(Number(saved[0].counted_price) - countedPrice) > 1e-10 || Number(saved[0].rule_version) !== rule.version) throw new Error('已固定欠保证金卖出计入口径冲突，禁止回改');
}

export const STOCK_LOT_DOWNSIDE_MEMBER_EPOCHS_DDL = `CREATE TABLE IF NOT EXISTS ledger_stock_lot_downside_member_epochs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, ledger_id INT NOT NULL, category_id INT NOT NULL,
  lot_id BIGINT NOT NULL, participation_id BIGINT NOT NULL, user_id INT NOT NULL,
  effective_at DATETIME(3) NOT NULL COMMENT 'UTC server prospective epoch',
  raw_price DECIMAL(30,12) NOT NULL, counted_price DECIMAL(30,12) NOT NULL,
  entry_counted_offset DECIMAL(30,12) NOT NULL,
  UNIQUE KEY uk_stock_member_downside_epoch (ledger_id,category_id,participation_id,effective_at),
  INDEX idx_stock_member_downside_scope (ledger_id,category_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
export async function readStockLotDownsideMemberEpochs(conn: any, ledgerId: number, categoryId: number, userId?: number): Promise<import('../shared/stock-lot-downside').StockLotDownsideMemberEpoch[]> {
  try {
    const [rows] = await conn.execute(`SELECT ledger_id,category_id,lot_id,participation_id,user_id,raw_price,counted_price,entry_counted_offset,
      DATE_FORMAT(effective_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS effective_at FROM ledger_stock_lot_downside_member_epochs
      WHERE ledger_id=? AND category_id=?${userId === undefined ? '' : ' AND user_id=?'}`,
    [ledgerId, categoryId, ...(userId === undefined ? [] : [userId])]);
    return rows.map((r: any) => ({ ledgerId: Number(r.ledger_id), categoryId: Number(r.category_id), lotId: Number(r.lot_id),
      participationId: Number(r.participation_id), userId: Number(r.user_id), rawPrice: Number(r.raw_price), countedPrice: Number(r.counted_price),
      entryCountedOffset: Number(r.entry_counted_offset), effectiveAt: iso(r.effective_at) }));
  } catch (e) { if (missingTable(e)) return []; throw e; }
}
/** No DDL here: table is installed only by the authorized rule-save migration. */
export async function appendStockLotDownsideMemberEpoch(conn: any, epoch: import('../shared/stock-lot-downside').StockLotDownsideMemberEpoch): Promise<void> {
  await conn.execute(`INSERT INTO ledger_stock_lot_downside_member_epochs
    (ledger_id,category_id,lot_id,participation_id,user_id,effective_at,raw_price,counted_price,entry_counted_offset)
    VALUES (?,?,?,?,?,?,?,?,?)`, [epoch.ledgerId, epoch.categoryId, epoch.lotId, epoch.participationId, epoch.userId,
      mysqlUtc(epoch.effectiveAt), epoch.rawPrice, epoch.countedPrice, epoch.entryCountedOffset]);
}
