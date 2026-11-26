import { getDbConnection, getDbTransactionConnection } from './db';
import { parsePortfolioInstrument, portfolioQuantityIsEmpty } from '../shared/portfolio-instruments';
import { isStockMarketSession, isStockSessionDate } from '../shared/stock-market-session';
import { isStockLotDownsideAutoWaiting, stockLotDownsideAutoThreshold, type StockLotDownsideRule } from '../shared/stock-lot-downside';
import { appendStockLotDownsideRule, invalidateStockLotDownsideRuleCache, readLatestStockLotDownsideRuleForUpdate, readStockLotDownsideRules } from './stock-lot-downside-rules';
import { markStockCalendarResultDirty } from './stock-calendar-result-cache';

export type StockLotDownsideAutoQuote = {
  ledgerId: 37; categoryId: number; symbol: string; price: number;
  currency: 'CNY' | 'USD' | 'USDT'; priceDate: string; observedAt: string | Date; source: string;
  /** These flags must travel with reference/derived quotes; an allowed provider does not override them. */
  kind?: 'live' | 'intraday' | 'reference' | 'close';
  isReference?: boolean; isFallback?: boolean; isClose?: boolean; isHistorical?: boolean;
  lookbackLow?: number; rangeLow?: number; low4h?: number; cutoffAt?: string;
};
export type StockLotDownsideTriggeredScope = { ledgerId: 37; categoryId: number; lotId: number; version: number };

function readOnlyEnvironment(): boolean {
  return ['PREVIEW_READONLY', 'FAST_PREVIEW', 'DEV_BYPASS_AUTH'].some(key => /^(true|1)$/i.test(process.env[key] ?? ''));
}
const instant = (value: unknown): number => value instanceof Date ? value.getTime()
  : typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
function localClock(date: Date, zone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` };
}
/** Pure fail-closed validation: no DB, network, source rewriting or historical lookback. */
export function isStockLotDownsideAutoQuoteValid(quote: StockLotDownsideAutoQuote, confirmedAt: Date): boolean {
  const instrument = parsePortfolioInstrument(quote?.symbol), confirmed = confirmedAt instanceof Date ? confirmedAt.getTime() : NaN;
  const observed = instant(quote?.observedAt), age = confirmed - observed;
  if (!quote || quote.ledgerId !== 37 || !Number.isSafeInteger(quote.categoryId) || quote.categoryId <= 0
    || !instrument || instrument.symbol !== quote.symbol || instrument.currency !== quote.currency
    || !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(age) || age < 0 || age > 120_000
    || !isStockSessionDate(quote.priceDate) || typeof quote.source !== 'string' || quote.source !== quote.source.trim()) return false;
  const allowedSources = instrument.market === 'CRYPTO' ? ['Gate.io', 'HTX']
    : instrument.market === 'A' ? ['新浪财经'] : ['新浪财经', 'Yahoo Finance'];
  if (!allowedSources.includes(quote.source) || (quote.kind !== undefined && !['live', 'intraday'].includes(quote.kind))) return false;
  const metadata = quote as StockLotDownsideAutoQuote & { autoTriggerEligible?: boolean; isViewingAs?: boolean };
  if (metadata.autoTriggerEligible === false || metadata.isViewingAs === true) return false;
  // Even freshly sampled lookback lows / close / cached fallback cannot masquerade as a current spot quote.
  if (Object.entries(quote).some(([key, value]) => /low|high|range|lookback|histor|candle|cutoff|reference|fallback|close|preview/i.test(key)
    && value !== undefined && value !== null && value !== false
    || /^(priceKind|priceType|quoteKind|quoteType)$/i.test(key) && !['live', 'intraday', 'spot', 'current'].includes(String(value)))) return false;
  const zone = instrument.market === 'US' ? 'America/New_York' : 'Asia/Shanghai';
  const clock = localClock(new Date(observed), zone);
  if (clock.date !== quote.priceDate) return false;
  if (instrument.market === 'CRYPTO') return true;
  if (!isStockMarketSession(clock.date, instrument.market)) return false;
  return instrument.market === 'A'
    ? (clock.time >= '09:30:00' && clock.time < '11:30:00') || (clock.time >= '13:00:00' && clock.time < '15:00:00')
    : clock.time >= '09:30:00' && clock.time < '16:00:00';
}
function canTrigger(rule: StockLotDownsideRule | null, quote: StockLotDownsideAutoQuote): rule is StockLotDownsideRule {
  return !!rule && rule.ledgerId === quote.ledgerId && rule.categoryId === quote.categoryId && rule.currency === quote.currency
    && Number.isSafeInteger(rule.lotId) && rule.lotId > 0 && Number.isSafeInteger(rule.userId) && rule.userId > 0
    && Number.isSafeInteger(rule.version) && rule.version > 0 && rule.enabled && isStockLotDownsideAutoWaiting(rule)
    && instant(quote.observedAt) >= instant(rule.armedAt) && quote.price <= rule.thresholdPrice;
}
function scopeValid(lot: any, quote: StockLotDownsideAutoQuote, rule: StockLotDownsideRule): boolean {
  return !!lot && Number(lot.ledger_id) === 37 && Number(lot.category_id) === quote.categoryId
    && Number(lot.category_ledger_id) === 37 && Number(lot.category_scope_id) === quote.categoryId
    && lot.parentId === null && Number(lot.isDefault) === 0 && lot.accounting_mode === 'stock_portfolio'
    && Number(lot.ledger_owner_id) === rule.userId && String(lot.symbol) === quote.symbol
    && Number.isFinite(Number(lot.initial_quantity)) && Number(lot.initial_quantity) > 0
    && Number(lot.unit_cost) === rule.autoEntryPrice && Number(lot.opened_event_id) > 0;
}
const lotColumns = `l.id,l.ledger_id,l.category_id,l.symbol,l.initial_quantity,l.unit_cost,l.opened_event_id,
  DATE_FORMAT(l.opened_at,'%Y-%m-%d %H:%i:%s') AS opened_at_wall,
  ledger.ownerId AS ledger_owner_id,c.id AS category_scope_id,c.ledgerId AS category_ledger_id,c.parentId,c.isDefault,c.accounting_mode`;
const lotJoins = `FROM ledger_stock_lots l INNER JOIN ledgers ledger ON ledger.id=l.ledger_id
  INNER JOIN ledger_categories c ON c.id=l.category_id AND c.ledgerId=l.ledger_id`;

/**
 * Called only after a genuinely new application quote refresh. Importing this module starts nothing.
 * Rules are append-only; calendar dirty is the only derived write. No DDL, trades, raw quotes, FX or wallet changes.
 * Return only committed scopes so the caller can invalidate its member caches without importing portfolio here.
 * Each lot failure is isolated, including old/missing schema; the surrounding quote refresh must continue.
 */
export async function processStockLotDownsideAutoQuote(quote: StockLotDownsideAutoQuote, confirmedAt = new Date()): Promise<StockLotDownsideTriggeredScope[]> {
  if (readOnlyEnvironment() || !isStockLotDownsideAutoQuoteValid(quote, confirmedAt)) return [];
  const triggered: StockLotDownsideTriggeredScope[] = [];
  let conn: any, candidates: StockLotDownsideRule[], snapshots: Map<number, any>;
  try {
    conn = await getDbConnection(); if (!conn) return [];
    const rules = await readStockLotDownsideRules(conn, 37, quote.categoryId, true);
    const latest = new Map<number, StockLotDownsideRule>();
    for (const rule of rules) if (!latest.has(rule.lotId) || latest.get(rule.lotId)!.version < rule.version) latest.set(rule.lotId, rule);
    candidates = Array.from(latest.values()).filter(rule => canTrigger(rule, quote));
    if (!candidates.length) return [];
    const [lots] = await conn.execute(`SELECT ${lotColumns} ${lotJoins}
      WHERE l.ledger_id=? AND l.category_id=? AND l.symbol=?`, [37, quote.categoryId, quote.symbol]);
    snapshots = new Map(lots.map((lot: any) => [Number(lot.id), lot]));
  } catch { return []; }
  for (const candidate of candidates) {
    const snapshot = snapshots.get(candidate.lotId);
    if (!scopeValid(snapshot, quote, candidate)) continue;
    let tx: any;
    try {
      if (readOnlyEnvironment()) break;
      tx = await getDbTransactionConnection(); if (!tx) continue;
      await tx.beginTransaction();
      // Global write lock order: lot -> real opening event -> newest rule. Never lock the rule first.
      const [lots] = await tx.execute(`SELECT ${lotColumns} ${lotJoins}
        WHERE l.id=? AND l.ledger_id=? AND l.category_id=? LIMIT 1 FOR UPDATE`, [candidate.lotId, 37, quote.categoryId]);
      const lot = lots[0];
      if (!scopeValid(lot, quote, candidate)) throw new Error('自动触发持仓或所有者已变化');
      const [openings] = await tx.execute(`SELECT id,ledger_id,category_id,event_type,status,symbol,quantity,execution_price,
        DATE_FORMAT(actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at_wall
        FROM ledger_stock_events WHERE id=? AND ledger_id=? AND category_id=? LIMIT 1 FOR UPDATE`,
      [Number(lot.opened_event_id), 37, quote.categoryId]);
      const opening = openings[0];
      const latest = await readLatestStockLotDownsideRuleForUpdate(tx, 37, quote.categoryId, candidate.lotId);
      if (!canTrigger(latest, quote) || latest.version !== candidate.version || latest.userId !== candidate.userId
        || latest.armedAt !== candidate.armedAt || latest.autoEntryPrice !== Number(lot.unit_cost)
        || latest.thresholdPrice !== stockLotDownsideAutoThreshold(Number(lot.unit_cost), latest.autoDropPercent!)
        || !opening || Number(opening.id) !== Number(lot.opened_event_id) || Number(opening.ledger_id) !== 37
        || Number(opening.category_id) !== quote.categoryId || opening.status !== 'active' || !['buy', 'add'].includes(opening.event_type)
        || String(opening.symbol) !== quote.symbol || Number(opening.quantity) !== Number(lot.initial_quantity)
        || Number(opening.execution_price) !== Number(lot.unit_cost) || !opening.actual_traded_at_wall
        || opening.actual_traded_at_wall !== lot.opened_at_wall
        || (latest.holdingStartAt !== undefined
          && instant(latest.holdingStartAt) !== Date.parse(`${String(opening.actual_traded_at_wall).replace(' ', 'T')}+08:00`))
        || Number(lot.initial_quantity) !== Number(snapshot.initial_quantity) || Number(lot.unit_cost) !== Number(snapshot.unit_cost)
        || Number(lot.opened_event_id) !== Number(snapshot.opened_event_id) || lot.opened_at_wall !== snapshot.opened_at_wall) {
        throw new Error('自动触发规则或实际开仓已变化');
      }
      const [sold] = await tx.execute(`SELECT COALESCE(SUM(a.quantity),0) AS quantity FROM ledger_stock_event_lot_allocations a
        INNER JOIN ledger_stock_events e ON e.id=a.event_id AND e.status='active' AND e.event_type IN ('reduce','sell')
        WHERE a.lot_id=? AND e.ledger_id=? AND e.category_id=? AND e.symbol=?`, [candidate.lotId, 37, quote.categoryId, quote.symbol]);
      const soldQuantity = Number(sold[0]?.quantity);
      if (!Number.isFinite(soldQuantity) || soldQuantity < 0 || portfolioQuantityIsEmpty(quote.symbol, Number(lot.initial_quantity) - soldQuantity)) {
        throw new Error('自动触发持仓已平仓或数量无效');
      }
      if (readOnlyEnvironment()) throw new Error('预览禁止自动触发');
      const confirmed = confirmedAt.toISOString();
      const next = await appendStockLotDownsideRule(tx, { ledgerId: 37, categoryId: quote.categoryId, lotId: candidate.lotId,
        userId: latest.userId, currency: quote.currency, enabled: true, activationMode: 'auto_drop', expectedVersion: latest.version,
        autoDropPercent: latest.autoDropPercent, autoEntryPrice: latest.autoEntryPrice, armedAt: latest.armedAt,
        effectiveAt: confirmed, triggeredAt: confirmed, createdAt: confirmed, currentRawPrice: quote.price,
        triggerPrice: quote.price, triggerQuoteAsOf: new Date(instant(quote.observedAt)).toISOString(), triggerSource: quote.source,
        holdingStartAt: latest.holdingStartAt });
      await markStockCalendarResultDirty(tx, quote.categoryId);
      await tx.commit();
      invalidateStockLotDownsideRuleCache(conn, 37, quote.categoryId);
      invalidateStockLotDownsideRuleCache(tx, 37, quote.categoryId);
      triggered.push({ ledgerId: 37, categoryId: quote.categoryId, lotId: next.lotId, version: next.version });
    } catch {
      if (tx) { try { await tx.rollback(); } catch { /* isolate rollback failure too */ } }
    } finally {
      if (typeof tx?.release === 'function') { try { tx.release(); } catch { /* never stop the quote refresh */ } }
    }
  }
  return triggered;
}
