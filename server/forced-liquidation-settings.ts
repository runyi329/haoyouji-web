import { getDbConnection } from './db';
import { readAllStockLotDownsideRules } from './stock-lot-downside-rules';
import { readAllOrdinaryTagDownsideRules } from './ordinary-tag-downside-rules';
import { isCryptoPortfolioSymbol, isValidCryptoPortfolioQuantity, portfolioQuantityIsEmpty } from '../shared/portfolio-instruments';
import type { StockLotDownsideRule } from '../shared/stock-lot-downside';
import type { OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';
import type { ForcedLiquidationStockQuote } from '../shared/forced-liquidation-display';
import { buildForcedLiquidationStockDetail, buildForcedLiquidationOrdinaryDetail, decodeForcedLiquidationStockQuotes,
  forcedLiquidationDetailSummary, aggregateForcedLiquidationStockSummaries, type ForcedLiquidationIneffectiveSummary } from './forced-liquidation-setting-summary';

export type ForcedLiquidationSettingsInput = {
  ledgerId: number;
  userId: number;
  systemRole?: string;
  isViewingAs?: boolean;
};
/** Ordinary rules retain their native account-amount threshold, separate from stock prices. */
export type ForcedLiquidationOrdinaryRule = {
  version: number;
  enabled: boolean;
  thresholdAmount: number;
  downsidePercent: number;
  startDate: string;
};
export type ForcedLiquidationStock = ForcedLiquidationIneffectiveSummary & {
  lotId: number;
  eventId: number;
  /** Original tag-page number; absent if this category's active-lot ordering is unknown. */
  positionNumber?: string;
  stockName: string;
  symbol: string;
  /** The real opening quantity, not the remaining quantity or a member allocation. */
  quantity: number;
  remainingQuantity: number;
  executionPrice: number;
  /** Beijing wall-clock actual execution; empty means unknown, never server registration. */
  actualTradedAt: string;
  note: string;
  currentDownsideRule: StockLotDownsideRule | null;
};
export type ForcedLiquidationCategory = ForcedLiquidationIneffectiveSummary & {
  categoryId: number;
  categoryName: string;
  accountingMode: 'stock_portfolio' | 'manual_balance';
  currency: 'CNY';
  lifecycleStatus: 'active' | 'paused' | 'ended';
  /** Effective global config date; null for active or inferred fully closed stock categories. */
  lifecycleDate: string | null;
  ordinaryRule: ForcedLiquidationOrdinaryRule | null;
  stocks: ForcedLiquidationStock[];
};
export type ForcedLiquidationSettings = {
  ledgerId: 37;
  canEdit: true;
  categories: ForcedLiquidationCategory[];
};

const sourceNumber = (value: unknown): number => value === null || value === undefined || value === '' ? NaN : Number(value);
const scopeKey = (categoryId: number, lotId: number) => `${categoryId}:${lotId}`;
function stableOpenedAt(value: unknown): string | undefined {
  // Never substitute opening.actual_traded_at, registration time, or a lot ID for missing ordering evidence.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return undefined;
  const iso = `${value.replace(' ', 'T')}Z`, timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === iso.replace('Z', '.000Z') ? value : undefined;
}
function numberOriginalPositions(stocks: ForcedLiquidationStock[], openedAt: ReadonlyMap<ForcedLiquidationStock, string | undefined>): ForcedLiquidationStock[] {
  // One missing active timestamp can change symbol insertion order and every later number.
  // Omit all numbers in that category, rather than falsely numbering only its known subset.
  if (stocks.some(stock => openedAt.get(stock) === undefined)) return stocks;
  const sorted = [...stocks].sort((a, b) => {
    const left = openedAt.get(a)!, right = openedAt.get(b)!;
    return (left < right ? -1 : left > right ? 1 : 0) || a.lotId - b.lotId;
  });
  // buildPortfolio uses a Map keyed by the real symbol in opened_at/id order; the UI
  // then numbers positions.flatMap(position.lots). Grouping must not merge real lots.
  const positions = new Map<string, ForcedLiquidationStock[]>();
  for (const stock of sorted) {
    const lots = positions.get(stock.symbol) ?? [];
    lots.push(stock); positions.set(stock.symbol, lots);
  }
  const numbered = Array.from(positions.values()).flat();
  numbered.forEach((stock, index) => { stock.positionNumber = String(index + 1).padStart(2, '0'); });
  return numbered;
}
function actualBeijingTime(value: unknown): string {
  // DATE_FORMAT returns a wall-clock string and avoids mysql/server timezone conversion.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return '';
  return `${value.replace(' ', 'T')}+08:00`;
}
function effectiveLifecycleDate(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}
const isMissingTable = (error: any): boolean => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
function isMissingEndDate(error: any): boolean {
  return (error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054)
    && /^Unknown column ['`](?:ledger_tag_config\.)?end_date['`] in ['`]field list['`]/i.test(error?.sqlMessage ?? error?.message ?? '');
}

function isMissingInitialAmount(error: any): boolean {
  return (error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054)
    && /^Unknown column ['`](?:ledger_tag_config\.)?initial_amount['`] in ['`]field list['`]/i.test(error?.sqlMessage ?? error?.message ?? '');
}

/**
 * Central owner settings, not a portfolio valuation or permission-expanding presentation read.
 * Five SELECTs plus one ordinary-rule batch when manual categories exist, regardless of tag/lot count.
 * Enabled stocks add exactly two scoped quote SELECTs; enabled ordinary tags add one scoped history SELECT.
 * Old schemas may require bounded compatibility SELECTs; disabled targets add no valuation reads.
 * No rule conversion, market requests, member/wallet reads, DDL, cache or mutation.
 */
export async function getForcedLiquidationSettings(input: ForcedLiquidationSettingsInput): Promise<ForcedLiquidationSettings> {
  if (input.isViewingAs) throw new Error('代看模式禁止维护强平设置');
  if (input.ledgerId !== 37) throw new Error('强平设置仅适用于37号账本');
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) throw new Error('仅37号账本所有者可以维护强平设置');
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接不可用');

  // Independent authorization must finish before querying any category, holding or rule.
  // A system role (including admin) or a ledger member role never substitutes for actual ownership.
  const [ownerRows] = await conn.execute('SELECT ownerId FROM ledgers WHERE id=? LIMIT 1', [input.ledgerId]);
  const owner = (ownerRows as any[])[0];
  if (!owner || sourceNumber(owner.ownerId) !== input.userId) throw new Error('仅37号账本所有者可以维护强平设置');

  const [categoryRows] = await conn.execute(`SELECT id,ledgerId,parentId,isDefault,name,accounting_mode,sortOrder
    FROM ledger_categories WHERE ledgerId=? AND parentId IS NULL AND isDefault=0
      AND accounting_mode IN ('stock_portfolio','manual_balance') ORDER BY sortOrder,id`, [input.ledgerId]);
  const categories: ForcedLiquidationCategory[] = (categoryRows as any[])
    .filter(row => sourceNumber(row.ledgerId) === input.ledgerId && row.parentId === null && Number(row.isDefault) === 0
      && Number.isSafeInteger(sourceNumber(row.id)) && sourceNumber(row.id) > 0
      && ['stock_portfolio', 'manual_balance'].includes(row.accounting_mode))
    .map(row => ({ categoryId: Number(row.id), categoryName: String(row.name), accountingMode: row.accounting_mode,
      currency: 'CNY', lifecycleStatus: 'active', lifecycleDate: null, ordinaryRule: null, stocks: [] }));
  const byCategory = new Map(categories.map(category => [category.categoryId, category]));
  // Global tag state only. Personal pause/history is deliberately not read or interpreted here.
  let tagConfigRows: any[] = [];
  let includeEndDate = true, includeInitialAmount = true;
  for (;;) {
    try {
      const [rows] = await conn.execute(`SELECT ledger_id,tag_name,pause_date,margin_pause_date${includeEndDate ? ',end_date' : ''}${includeInitialAmount ? ',initial_amount' : ''}
        FROM ledger_tag_config WHERE ledger_id=?`, [input.ledgerId]);
      tagConfigRows = rows as any[]; break;
    } catch (error) {
      if (includeEndDate && isMissingEndDate(error)) { includeEndDate = false; continue; }
      if (includeInitialAmount && isMissingInitialAmount(error)) { includeInitialAmount = false; continue; }
      if (!isMissingTable(error)) throw error;
      break;
    }
  }
  const tagConfigs = new Map(tagConfigRows.filter(row => sourceNumber(row.ledger_id) === input.ledgerId
    && typeof row.tag_name === 'string').map(row => [row.tag_name, row]));
  // Read the Beijing calendar once; no process timezone mutation or business-rule recalculation.
  const now = Date.now();
  const today = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const mysqlNow = new Date(now + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  for (const category of categories) {
    const config = tagConfigs.get(category.categoryName);
    const endDate = effectiveLifecycleDate(config?.end_date, today);
    const pauseDate = effectiveLifecycleDate(config?.margin_pause_date ?? config?.pause_date, today);
    if (endDate !== null) {
      category.lifecycleStatus = 'ended'; category.lifecycleDate = endDate;
    } else if (pauseDate !== null) {
      category.lifecycleStatus = 'paused'; category.lifecycleDate = pauseDate;
    }
  }
  let ordinaryRules = new Map<number, OrdinaryTagDownsideRule[]>();
  if (categories.some(category => category.accountingMode === 'manual_balance')) {
    ordinaryRules = await readAllOrdinaryTagDownsideRules(conn, input.ledgerId);
    for (const category of categories) {
      if (category.accountingMode !== 'manual_balance') continue;
      const latest = (ordinaryRules.get(category.categoryId) ?? []).filter(rule => rule.categoryId === category.categoryId)
        .reduce<ForcedLiquidationOrdinaryRule | null>((previous, rule) => !previous || rule.version > previous.version ? rule : previous, null);
      category.ordinaryRule = latest === null ? null : { version: latest.version, enabled: latest.enabled,
        thresholdAmount: latest.thresholdAmount, downsidePercent: latest.downsidePercent, startDate: latest.startDate };
    }
  }

  // One ledger-wide holding query. Both the opening and sale allocation are tenant/tag scoped.
  // Lots have no status column: voids come from opening.status, closure from remaining quantity.
  const [stockRows] = await conn.execute(`SELECT l.id,l.ledger_id,l.category_id,l.symbol,l.stock_name,l.opened_event_id,
      l.initial_quantity,l.unit_cost,opening.status AS opening_status,opening.event_type AS opening_event_type,
      DATE_FORMAT(l.opened_at,'%Y-%m-%d %H:%i:%s') AS opened_at,
      DATE_FORMAT(opening.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at,
      COALESCE(l.note,opening.note,'') AS note,
      COALESCE(SUM(CASE WHEN sale.status='active' AND sale.ledger_id=l.ledger_id
        AND sale.category_id=l.category_id AND sale.event_type IN ('reduce','sell') THEN a.quantity ELSE 0 END),0) AS allocated_quantity,
      COALESCE(SUM(CASE WHEN sale.status='active' AND sale.ledger_id=l.ledger_id AND sale.category_id=l.category_id
        AND sale.symbol=l.symbol AND sale.event_type IN ('reduce','sell') AND sale.actual_traded_at<=?
        THEN a.quantity ELSE 0 END),0) AS current_allocated_quantity
    FROM ledger_stock_lots l
    INNER JOIN ledger_categories category ON category.id=l.category_id AND category.ledgerId=l.ledger_id
      AND category.parentId IS NULL AND category.isDefault=0 AND category.accounting_mode='stock_portfolio'
    INNER JOIN ledger_stock_events opening ON opening.id=l.opened_event_id AND opening.ledger_id=l.ledger_id
      AND opening.category_id=l.category_id AND opening.status='active' AND opening.event_type IN ('buy','add')
      AND opening.symbol=l.symbol
    LEFT JOIN ledger_stock_event_lot_allocations a ON a.lot_id=l.id
    LEFT JOIN ledger_stock_events sale ON sale.id=a.event_id AND sale.ledger_id=l.ledger_id AND sale.category_id=l.category_id
    WHERE l.ledger_id=? GROUP BY l.id ORDER BY category.sortOrder,category.id,l.opened_at ASC,l.id ASC`, [mysqlNow, input.ledgerId]);
  // Preserve raw enabled/amount evidence (decode's Number(null) must not turn corruption into zero),
  // while still using the original list store/CAS decoder and its bounded old-schema compatibility.
  let rawSavedRules: any[] = [];
  const rules = await readAllStockLotDownsideRules({ execute: async (sql: string, params: unknown[]) => {
    const result = await conn.execute(sql, params); rawSavedRules = result[0] as any[]; return result;
  } }, input.ledgerId);
  const latest = new Map<string, StockLotDownsideRule>();
  for (const rule of rules) {
    if (rule.ledgerId !== input.ledgerId || byCategory.get(rule.categoryId)?.accountingMode !== 'stock_portfolio') continue;
    const key = scopeKey(rule.categoryId, rule.lotId), previous = latest.get(key);
    // Settings/CAS use the highest saved version, including disabled or future-effective revisions.
    if (!previous || rule.version > previous.version) latest.set(key, rule);
  }

  const closedCategories = new Set<number>(), unclosedCategories = new Set<number>();
  const openedAtByStock = new Map<ForcedLiquidationStock, string | undefined>();
  const rawByStock = new Map<ForcedLiquidationStock, any>();
  for (const row of stockRows as any[]) {
    const category = byCategory.get(sourceNumber(row.category_id));
    if (!category || category.accountingMode !== 'stock_portfolio' || sourceNumber(row.ledger_id) !== input.ledgerId
      || row.opening_status !== 'active' || !['buy', 'add'].includes(row.opening_event_type)) continue;
    const lotId = sourceNumber(row.id), eventId = sourceNumber(row.opened_event_id), symbol = String(row.symbol ?? '');
    const quantity = sourceNumber(row.initial_quantity), allocated = sourceNumber(row.allocated_quantity);
    const executionPrice = sourceNumber(row.unit_cost);
    if (!Number.isSafeInteger(lotId) || lotId <= 0 || !Number.isSafeInteger(eventId) || eventId <= 0
      || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(allocated) || allocated < 0
      || !Number.isFinite(executionPrice) || executionPrice <= 0) continue;
    const crypto = isCryptoPortfolioSymbol(symbol);
    if (crypto && (!isValidCryptoPortfolioQuantity(quantity) || (allocated !== 0 && !isValidCryptoPortfolioQuantity(allocated)))) continue;
    // Only validated, real openings can establish closure. Tiny residuals are not proof of a full sale.
    (allocated >= quantity ? closedCategories : unclosedCategories).add(category.categoryId);
    const remaining = Math.max(0, quantity - allocated);
    const remainingQuantity = crypto ? Number(remaining.toFixed(8)) : remaining;
    if (portfolioQuantityIsEmpty(symbol, remainingQuantity)) continue;
    const stock: ForcedLiquidationStock = { lotId, eventId, stockName: String(row.stock_name ?? ''), symbol, quantity,
      remainingQuantity, executionPrice, actualTradedAt: actualBeijingTime(row.actual_traded_at), note: String(row.note ?? ''),
      currentDownsideRule: latest.get(scopeKey(category.categoryId, lotId)) ?? null };
    category.stocks.push(stock); openedAtByStock.set(stock, stableOpenedAt(row.opened_at));
    rawByStock.set(stock, row);
  }
  for (const category of categories) {
    // Compute once from the complete active holdings, before UI search/enabled/lifecycle filters.
    category.stocks = numberOriginalPositions(category.stocks, openedAtByStock);
    if (category.accountingMode === 'stock_portfolio' && category.lifecycleStatus !== 'ended'
      && category.stocks.length === 0 && closedCategories.has(category.categoryId) && !unclosedCategories.has(category.categoryId)) {
      category.lifecycleStatus = 'ended'; category.lifecycleDate = null;
    }
  }

  const enabledStocks = categories.flatMap(category => category.stocks
    .filter(stock => stock.currentDownsideRule?.enabled === true).map(stock => ({ category, stock })));
  if (enabledStocks.length) {
    const targets = Array.from(new Map(enabledStocks.map(({ category, stock }) => [
      JSON.stringify([category.categoryId, stock.symbol]), { categoryId: category.categoryId, symbol: stock.symbol },
    ])).values());
    const quotes = new Map<string, ForcedLiquidationStockQuote[]>();
    for (const target of targets) quotes.set(JSON.stringify([target.categoryId, target.symbol]), []);
    // Exact category+symbol pairs, not independently widened IN lists. Each table is read once.
    for (const [table, source] of [['ledger_stock_price_snapshots', 'close'], ['ledger_stock_intraday_quotes', 'intraday']] as const) {
      try {
        const [found] = await conn.execute(`SELECT ledger_id,category_id,symbol,price,
            DATE_FORMAT(price_date,'%Y-%m-%d') AS price_date,
            DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s.%f') AS captured_at
          FROM ${table} WHERE ledger_id=? AND (${targets.map(() => '(category_id=? AND symbol=?)').join(' OR ')})
            AND price_date<=? AND captured_at<=? ORDER BY price_date,captured_at,id`,
        [input.ledgerId, ...targets.flatMap(t => [t.categoryId, t.symbol]), today, mysqlNow]);
        const buckets = new Map<string, any[]>();
        for (const q of found as any[]) {
          const key = JSON.stringify([sourceNumber(q.category_id), q.symbol]);
          if (!quotes.has(key)) continue;
          const bucket = buckets.get(key) ?? []; bucket.push(q); buckets.set(key, bucket);
        }
        for (const target of targets) {
          const key = JSON.stringify([target.categoryId, target.symbol]);
          quotes.get(key)!.push(...decodeForcedLiquidationStockQuotes(buckets.get(key) ?? [], target.categoryId, target.symbol, table, source, now));
        }
      } catch (error) { if (!isMissingTable(error)) throw error; }
    }
    const rawLatest = new Map<string, any>();
    for (const row of rawSavedRules) {
      if (sourceNumber(row.ledger_id) !== input.ledgerId) continue;
      const key = scopeKey(sourceNumber(row.category_id), sourceNumber(row.lot_id)), previous = rawLatest.get(key);
      if (!previous || sourceNumber(row.version) > sourceNumber(previous.version)) rawLatest.set(key, row);
    }
    for (const { category, stock } of enabledStocks) {
      const raw = rawByStock.get(stock);
      const saved = rawLatest.get(scopeKey(category.categoryId, stock.lotId));
      const dto = buildForcedLiquidationStockDetail({ ...input, categoryId: category.categoryId, lotId: stock.lotId },
        [{ ...raw, allocated_quantity: raw.current_allocated_quantity }],
        quotes.get(JSON.stringify([category.categoryId, stock.symbol])) ?? [], saved ? [saved] : [], now);
      Object.assign(stock, forcedLiquidationDetailSummary(dto));
    }
    for (const category of categories) {
      if (category.accountingMode === 'stock_portfolio') Object.assign(category,
        aggregateForcedLiquidationStockSummaries(category.stocks.filter(stock => stock.currentDownsideRule?.enabled === true)));
    }
  }
  const enabledOrdinary = categories.filter(category => category.accountingMode === 'manual_balance' && category.ordinaryRule?.enabled === true);
  if (enabledOrdinary.length) {
    const ids = enabledOrdinary.map(category => category.categoryId), placeholders = ids.map(() => '?').join(',');
    let records: any[] = [];
    try {
      const [found] = await conn.execute(`SELECT r.ledgerId,r.id,COALESCE(c.parentId,c.id) AS categoryId,
          DATE_FORMAT(r.recordDate,'%Y-%m-%d') AS recordDate,r.type,r.amount,
          DATE_FORMAT(r.createdAt,'%Y-%m-%d %H:%i:%s.%f') AS createdAt,r.deleted_at AS deletedAt,
          CASE WHEN r.type='transfer' THEN r.description ELSE NULL END AS description
        FROM ledger_records r INNER JOIN ledger_categories c ON c.id=r.categoryId AND c.ledgerId=r.ledgerId
        WHERE r.ledgerId=? AND (c.id IN (${placeholders}) OR c.parentId IN (${placeholders}))
          AND r.deleted_at IS NULL AND r.recordDate<=? ORDER BY r.recordDate,r.createdAt,r.id`, [input.ledgerId, ...ids, ...ids, today]);
      records = found as any[];
    } catch (error) { if (!isMissingTable(error)) throw error; }
    const byRecordCategory = new Map<number, any[]>();
    for (const record of records) {
      const categoryId = sourceNumber(record.categoryId);
      if (!ids.includes(categoryId) || sourceNumber(record.ledgerId) !== input.ledgerId) continue;
      const bucket = byRecordCategory.get(categoryId) ?? []; bucket.push(record); byRecordCategory.set(categoryId, bucket);
    }
    for (const category of enabledOrdinary) {
      const configs = tagConfigRows.filter(row => sourceNumber(row.ledger_id) === input.ledgerId && row.tag_name === category.categoryName);
      const dto = buildForcedLiquidationOrdinaryDetail({ ...input, categoryId: category.categoryId }, category.categoryName,
        configs, byRecordCategory.get(category.categoryId) ?? [], ordinaryRules.get(category.categoryId) ?? [], today);
      Object.assign(category, forcedLiquidationDetailSummary(dto));
    }
  }
  return { ledgerId: 37, canEdit: true, categories };
}
