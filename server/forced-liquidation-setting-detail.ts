import { getDbConnection } from './db';
import { readOrdinaryTagDownsideRules } from './ordinary-tag-downside-rules';
import type { ForcedLiquidationSettingDetail, ForcedLiquidationStockQuote } from '../shared/forced-liquidation-display';
import { buildForcedLiquidationStockDetail, buildForcedLiquidationOrdinaryDetail, decodeForcedLiquidationStockQuotes } from './forced-liquidation-setting-summary';

export type ForcedLiquidationSettingDetailInput = {
  ledgerId: number; userId: number; categoryId: number; lotId?: number; systemRole?: string; isViewingAs?: boolean;
};
type Connection = NonNullable<Awaited<ReturnType<typeof getDbConnection>>>;
const id = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function number(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === ''
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value))) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
const missingTable = (error: any) => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
const missingColumn = (error: any) => error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054;
const missingActivationMode = (error: any) => missingColumn(error)
  && /Unknown column ['`](?:\w+\.)?activation_mode['`]/i.test(String(error?.sqlMessage ?? error?.message));
// These DATETIME(3) columns contain UTC wall values already: no driver/local-zone conversion.
const utcMillisColumn = (name: string) => `CONCAT(LEFT(DATE_FORMAT(${name},'%Y-%m-%dT%H:%i:%s.%f'),23),'Z') AS ${name}`;
async function rows(conn: Connection, sql: string, values: unknown[]): Promise<any[]> {
  // This local boundary is deliberately incapable of transaction/DDL/write statements.
  if (!/^SELECT\b/.test(sql) || /\bFOR\s+UPDATE\b/i.test(sql)) throw new Error('详情仅允许SELECT');
  const [result] = await conn.execute(sql, values);
  if (!Array.isArray(result)) throw new Error('数据库读取结果异常');
  return result;
}
/** Only invoked after expansion. Independent actual-owner SELECT precedes every data read.
 * No import of routers/ledger-stock-portfolio, first-page service, members, wallet or price scanner.
 */
export async function getForcedLiquidationSettingDetail(input: ForcedLiquidationSettingDetailInput): Promise<ForcedLiquidationSettingDetail> {
  if (input.isViewingAs) throw new Error('代看模式禁止读取强平详情');
  if (input.ledgerId !== 37) throw new Error('强平详情仅适用于37号账本');
  if (!id(input.userId)) throw new Error('仅37号账本实际所有者可读取强平详情');
  if (!id(input.categoryId) || (input.lotId !== undefined && !id(input.lotId))) throw new Error('分类或持仓范围无效');
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接不可用');
  const owners = await rows(conn, 'SELECT ownerId FROM ledgers WHERE id=? LIMIT 1', [37]);
  if (owners.length !== 1 || number(owners[0]?.ownerId) !== input.userId) throw new Error('仅37号账本实际所有者可读取强平详情');
  const categories = await rows(conn, `SELECT id,ledgerId,parentId,isDefault,name,accounting_mode
    FROM ledger_categories WHERE ledgerId=? AND id=? AND parentId IS NULL AND isDefault=0
      AND accounting_mode IN ('stock_portfolio','manual_balance') LIMIT 1`, [37, input.categoryId]);
  const category = categories[0];
  if (categories.length !== 1 || number(category?.id) !== input.categoryId || number(category?.ledgerId) !== 37
    || category.parentId !== null || number(category.isDefault) !== 0 || typeof category.name !== 'string' || !category.name.trim()
    || !['stock_portfolio', 'manual_balance'].includes(category.accounting_mode)) throw new Error('分类不属于37号有效顶级标签');
  if (category.accounting_mode === 'stock_portfolio') {
    if (!id(input.lotId)) throw new Error('股票详情必须指定真实持仓lotId');
    return stockDetail(conn, input, Date.now());
  }
  if (input.lotId !== undefined) throw new Error('普通标签不允许指定股票lotId');
  return ordinaryDetail(conn, input, category.name, new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10));
}
async function stockDetail(conn: Connection, input: ForcedLiquidationSettingDetailInput, now: number) {
  const lots = await rows(conn, `SELECT l.id,l.ledger_id,l.category_id,l.symbol,l.unit_cost,l.initial_quantity,
      opening.status AS opening_status,opening.event_type AS opening_event_type,
      DATE_FORMAT(opening.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at,
      COALESCE(SUM(CASE WHEN sale.status='active' AND sale.ledger_id=l.ledger_id AND sale.category_id=l.category_id
        AND sale.symbol=l.symbol AND sale.event_type IN ('reduce','sell') AND sale.actual_traded_at<=?
        THEN a.quantity ELSE 0 END),0) AS allocated_quantity
    FROM ledger_stock_lots l
    INNER JOIN ledger_stock_events opening ON opening.id=l.opened_event_id AND opening.ledger_id=l.ledger_id
      AND opening.category_id=l.category_id AND opening.symbol=l.symbol AND opening.status='active'
      AND opening.event_type IN ('buy','add')
    LEFT JOIN ledger_stock_event_lot_allocations a ON a.lot_id=l.id
    LEFT JOIN ledger_stock_events sale ON sale.id=a.event_id AND sale.ledger_id=l.ledger_id AND sale.category_id=l.category_id
    WHERE l.ledger_id=? AND l.category_id=? AND l.id=? GROUP BY l.id`,
  [new Date(now + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' '), 37, input.categoryId, input.lotId]);
  const lot = lots[0];
  if (lots.length !== 1 || number(lot?.id) !== input.lotId || number(lot?.ledger_id) !== 37
    || number(lot?.category_id) !== input.categoryId || lot.opening_status !== 'active'
    || !['buy', 'add'].includes(lot.opening_event_type) || typeof lot.symbol !== 'string') throw new Error('持仓不属于该分类或真实开仓已作废');
  const today = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  const mysqlNow = new Date(now + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  const quotes: ForcedLiquidationStockQuote[] = [];
  // Exact SELECT-only counterparts of getLatestQuotes/getLatestIntradayQuotes. Do not use
  // reference trade prices as current market quotes, do not call their DDL-capable parent.
  for (const [table, source] of [['ledger_stock_price_snapshots', 'close'], ['ledger_stock_intraday_quotes', 'intraday']] as const) {
    try {
      const found = await rows(conn, `SELECT ledger_id,category_id,symbol,price,
          DATE_FORMAT(price_date,'%Y-%m-%d') AS price_date,
          DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s.%f') AS captured_at
        FROM ${table} WHERE ledger_id=? AND category_id=? AND symbol=? AND price_date<=? AND captured_at<=?
        ORDER BY price_date,captured_at,id`, [37, input.categoryId, lot.symbol, today, mysqlNow]);
      quotes.push(...decodeForcedLiquidationStockQuotes(found, input.categoryId, lot.symbol, table, source, now));
    } catch (error) { if (!missingTable(error)) throw error; }
  }
  const baseColumns = `ledger_id,category_id,lot_id,user_id,version,enabled,threshold_price,downside_percent,
    ${utcMillisColumn('effective_at')},baseline_raw_price,baseline_counted_price,currency`;
  let saved: any[] = [];
  const suffix = 'FROM ledger_stock_lot_downside_rules WHERE ledger_id=? AND category_id=? AND lot_id=? ORDER BY version DESC LIMIT 1';
  try {
    try { saved = await rows(conn, `SELECT ${baseColumns},DATE_FORMAT(start_date,'%Y-%m-%d') AS start_date,
      baseline_status,baseline_source,holding_start_at,activation_mode,auto_drop_percent,auto_entry_price,
      ${utcMillisColumn('armed_at')},${utcMillisColumn('triggered_at')},trigger_price,
      ${utcMillisColumn('trigger_quote_as_of')},trigger_source ${suffix}`, [37, input.categoryId, input.lotId]); }
    catch (error) {
      if (!missingColumn(error)) throw error;
      let legacy = missingActivationMode(error);
      if (!legacy) {
        // The oldest schema may report start_date first. Confirm the mode column is absent
        // using SELECT only; a partially migrated auto schema must never become manual.
        try { await rows(conn, `SELECT activation_mode ${suffix}`, [37, input.categoryId, input.lotId]); }
        catch (modeError) { if (!missingActivationMode(modeError)) throw modeError; legacy = true; }
      }
      if (!legacy) throw error;
      try { saved = await rows(conn, `SELECT ${baseColumns},DATE_FORMAT(start_date,'%Y-%m-%d') AS start_date,
        baseline_status,baseline_source,holding_start_at ${suffix}`, [37, input.categoryId, input.lotId]); }
      catch (legacyError) { if (!missingColumn(legacyError)) throw legacyError; saved = await rows(conn, `SELECT ${baseColumns} ${suffix}`, [37, input.categoryId, input.lotId]); }
    }
  } catch (error) { if (!missingTable(error)) throw error; }
  return buildForcedLiquidationStockDetail(input, lots, quotes, saved, now);
}

async function ordinaryDetail(conn: Connection, input: ForcedLiquidationSettingDetailInput, name: string, today: string) {
  let configs: any[] = [];
  try { configs = await rows(conn, `SELECT ledger_id,tag_name,initial_amount FROM ledger_tag_config
    WHERE ledger_id=? AND tag_name=?`, [37, name]); }
  catch (error) { if (!missingTable(error) && !missingColumn(error)) throw error; }
  const rules = await readOrdinaryTagDownsideRules(conn, 37, input.categoryId);
  const records = await rows(conn, `SELECT r.ledgerId,r.id,COALESCE(c.parentId,c.id) AS categoryId,
      DATE_FORMAT(r.recordDate,'%Y-%m-%d') AS recordDate,r.type,r.amount,
      DATE_FORMAT(r.createdAt,'%Y-%m-%d %H:%i:%s.%f') AS createdAt,r.deleted_at AS deletedAt,
      CASE WHEN r.type='transfer' THEN r.description ELSE NULL END AS description
    FROM ledger_records r INNER JOIN ledger_categories c ON c.id=r.categoryId AND c.ledgerId=r.ledgerId
    WHERE r.ledgerId=? AND (c.id=? OR c.parentId=?) AND r.deleted_at IS NULL AND r.recordDate<=?
    ORDER BY r.recordDate,r.createdAt,r.id`, [37, input.categoryId, input.categoryId, today]);
  return buildForcedLiquidationOrdinaryDetail(input, name, configs, records, rules, today);
}
