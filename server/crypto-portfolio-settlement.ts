import { getDbConnection, getDbTransactionConnection } from './db';
import { fetchCryptoPortfolioCloseQuotes, fetchCryptoPortfolioQuotes } from './crypto-portfolio-quotes';
import { fetchCryptoUsdtCnyAtClose } from './crypto-portfolio-fx';
import { fetchStockUsdCnyAtClose, type StockUsdCnyClosePoint } from './stock-usd-cny-rate';
import { validateCryptoSavedUsdAnchor, validateCryptoUsdCnyClosePoint } from './crypto-portfolio-usd-anchor';
import { fetchOvernightUnifiedCloseQuotes, fetchUnifiedCloseQuotes, marketSessionDateFromBeijingTradeTimestamp, marketDateFromTimestamp } from './stock-unified-close-quotes';
import { decodeStockCalendarResult, markStockCalendarResultDirty } from './stock-calendar-result-cache';
import { buildMemberStockCalendar, type MemberCalendarSnapshot } from './shared/stock-member-calendar';
import { CRYPTO_PORTFOLIO_POLICY_VERSION, cryptoPortfolioBeijingDate, cryptoPortfolioCutoffAt,
  getCryptoPortfolioEffectiveDate, latestCryptoPortfolioSnapshotDate, parsePortfolioTradeTime } from '../shared/crypto-portfolio-policy';
import { isCryptoPortfolioSymbol, parsePortfolioInstrument, portfolioQuantityIsEmpty } from '../shared/portfolio-instruments';
import { isStockSessionDate, isStockMarketSession, previousStockMarketSession, shiftStockSessionDate } from '../shared/stock-market-session';
import { buildCryptoPortfolioDailyPayload, revalueCryptoPortfolioDailyPayloads, cryptoPortfolioDownsideFingerprint,
  cryptoPortfolioStockAnchor, isCryptoCalendarCloseQuote,
  pendingCryptoCalendarSnapshot, type CryptoCalendarLot, type CryptoCalendarSale, type CryptoCalendarParticipation,
  type CryptoCalendarClosure, type CryptoCalendarObservation, type CryptoCalendarQuote, type CryptoCalendarUsdFx,
  type CryptoPortfolioDailyPayload, type CryptoCalendarPersistedActivation } from './shared/crypto-portfolio-calendar';
import { readStockLotDownsideRules, readStockLotDownsideSales, readStockLotDownsideMemberEpochs } from './stock-lot-downside-rules';
import { stockLotDownsideMemberEntryAt, stockLotDownsideMemberOffset, stockLotDownsidePriceAsOf, type StockLotDownsideRule } from '../shared/stock-lot-downside';

const LEDGER_ID = 37;
const POLICY = CRYPTO_PORTFOLIO_POLICY_VERSION;
const STOCK_POLICY = 'cn-day-us-overnight-1505-v1';
export const CRYPTO_PORTFOLIO_SNAPSHOT_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ledger_crypto_portfolio_daily_snapshots (
  ledger_id INT NOT NULL, category_id INT NOT NULL, snapshot_date DATE NOT NULL,
  policy_version VARCHAR(80) NOT NULL, activation_date DATE NOT NULL,
  payload JSON NOT NULL, captured_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (ledger_id,category_id,snapshot_date,policy_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
let tableReady: Promise<void> | null = null;
let intradayFlight: Promise<{ categories: number; symbols: number; updated: number }> | null = null;
const missingTable = (error: any) => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
const sourceNumber = (value: unknown) => value === null || value === undefined || value === '' ? Number.NaN : Number(value);
const wallIso = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;
  const time = parsePortfolioTradeTime(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const validateId = (categoryId: number) => {
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new Error('数字币日历标签编号无效');
};
const sourceDate = (row: any, symbol: string): string | null => {
  if (!parsePortfolioInstrument(symbol)) return null;
  if (!isCryptoPortfolioSymbol(symbol)) return marketSessionDateFromBeijingTradeTimestamp(row.actual_traded_at, parsePortfolioInstrument(symbol)!.market as 'A' | 'US');
  const actual = wallIso(row.actual_traded_at), registered = wallIso(row.registered_at);
  return actual && registered && isStockSessionDate(row.effective_date)
    && row.effective_date === getCryptoPortfolioEffectiveDate(actual, registered) ? row.effective_date : null;
};

/** Explicit migration helper. Own new table only; never calls core ensure, never runs at import or read. */
export async function ensureCryptoPortfolioSettlementTables(): Promise<void> {
  if (!tableReady) tableReady = (async () => {
    const conn = await getDbConnection(); if (!conn) throw new Error('数据库连接不可用');
    await (conn as any).execute(CRYPTO_PORTFOLIO_SNAPSHOT_TABLE_DDL);
  })().catch(error => { tableReady = null; throw error; });
  await tableReady;
}

async function readActivationState(conn: any, categoryId: number) {
  const [rows] = await conn.execute(`SELECT DATE_FORMAT(MIN(e.settlement_effective_date),'%Y-%m-%d') AS activation_date
    FROM ledger_stock_lots l INNER JOIN ledger_stock_events e ON e.id=l.opened_event_id
      AND e.ledger_id=l.ledger_id AND e.category_id=l.category_id AND e.status='active'
    INNER JOIN ledger_categories category ON category.id=l.category_id AND category.ledgerId=l.ledger_id
      AND category.parentId IS NULL AND category.accounting_mode='stock_portfolio'
    WHERE l.ledger_id=? AND l.category_id=? AND l.symbol LIKE 'CRYPTO:%-USDT'`, [LEDGER_ID, categoryId]);
  const candidates = rows.map((row: any) => row.activation_date).filter(isStockSessionDate);
  // Once activated/published, a later deletion/void cannot remove immutable historical calendar rows.
  let persistedActivation: CryptoCalendarPersistedActivation | null = null;
  try {
    const [saved] = await conn.execute(`SELECT saved.ledger_id,saved.category_id,saved.policy_version,
      DATE_FORMAT(MIN(activation_date),'%Y-%m-%d') AS activation_date,
      DATE_FORMAT(MIN(snapshot_date),'%Y-%m-%d') AS snapshot_date
      FROM ledger_crypto_portfolio_daily_snapshots saved
      INNER JOIN ledger_categories category ON category.id=saved.category_id AND category.ledgerId=saved.ledger_id
        AND category.parentId IS NULL AND category.accounting_mode='stock_portfolio'
      WHERE saved.ledger_id=? AND saved.category_id=? AND saved.policy_version=?
      GROUP BY saved.ledger_id,saved.category_id,saved.policy_version`, [LEDGER_ID, categoryId, POLICY]);
    const row = saved[0];
    if (row && Number(row.ledger_id) === LEDGER_ID && Number(row.category_id) === categoryId && row.policy_version === POLICY
      && isStockSessionDate(row.activation_date) && isStockSessionDate(row.snapshot_date) && row.activation_date <= row.snapshot_date) {
      persistedActivation = { ledgerId: LEDGER_ID, categoryId, policyVersion: row.policy_version,
        activationDate: row.activation_date, snapshotDate: row.snapshot_date };
      candidates.push(row.activation_date);
    }
  } catch (error) { if (!missingTable(error)) throw error; }
  const activationDate: string | null = candidates.sort()[0] ?? null;
  return { activationDate, persistedActivation: persistedActivation?.activationDate === activationDate ? persistedActivation : null };
}
async function readActivation(conn: any, categoryId: number): Promise<string | null> {
  return (await readActivationState(conn, categoryId)).activationDate;
}
export async function getCryptoPortfolioActivationDate(categoryId: number, readConnection?: any): Promise<string | null> {
  validateId(categoryId); const conn = readConnection ?? await getDbConnection(); if (!conn) throw new Error('数据库连接不可用');
  return readActivation(conn, categoryId);
}
function decodePayload(value: any, categoryId: number, date?: string): CryptoPortfolioDailyPayload {
  const payload = typeof value === 'string' ? JSON.parse(value) : value;
  if (!payload || payload.ledgerId !== LEDGER_ID || payload.categoryId !== categoryId || payload.policyVersion !== POLICY
    || !isStockSessionDate(payload.snapshotDate) || date && payload.snapshotDate !== date
    || !payload.total?.ready || !payload.members || !payload.observations) throw new Error('invalid_saved_crypto_payload');
  return payload;
}
async function readPayload(conn: any, categoryId: number, date: string): Promise<CryptoPortfolioDailyPayload | null> {
  const [rows] = await conn.execute(`SELECT payload FROM ledger_crypto_portfolio_daily_snapshots
    WHERE ledger_id=? AND category_id=? AND snapshot_date=? AND policy_version=?`, [LEDGER_ID, categoryId, date, POLICY]);
  return rows.length ? decodePayload(rows[0].payload, categoryId, date) : null;
}

async function readHistory(conn: any, categoryId: number, knownRules?: readonly StockLotDownsideRule[]) {
  const scope = [LEDGER_ID, categoryId];
  // Scoped SELECT-only batch; absent optional tables mean legacy/raw accounting, never a read-time DDL.
  const downsideRules = knownRules ?? await readStockLotDownsideRules(conn, LEDGER_ID, categoryId, true);
  const countedSales = downsideRules.length ? await readStockLotDownsideSales(conn, LEDGER_ID, categoryId) : [];
  const downsideMemberEpochs = downsideRules.length ? await readStockLotDownsideMemberEpochs(conn, LEDGER_ID, categoryId) : [];
  const countedSalePrice = (lotId: number, eventId: number, rawPrice: number) => {
    const saved = countedSales.find(s => s.lotId === lotId && s.eventId === eventId);
    if (!saved) return undefined;
    if (!Number.isFinite(saved.rawPrice) || !Number.isFinite(saved.countedPrice)
      || Math.abs(saved.rawPrice - rawPrice) > Math.max(1e-10, Math.abs(rawPrice) * 1e-10)) throw new Error('invalid_downside_sale_evidence');
    return saved.countedPrice;
  };
  const [lotRows] = await conn.execute(`SELECT l.id,l.symbol,l.initial_quantity,l.unit_cost,e.transaction_fee AS opening_fee,
    DATE_FORMAT(e.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at,
    DATE_FORMAT(e.server_registered_at,'%Y-%m-%d %H:%i:%s') AS registered_at,
    DATE_FORMAT(e.settlement_effective_date,'%Y-%m-%d') AS effective_date
    FROM ledger_stock_lots l INNER JOIN ledger_stock_events e ON e.id=l.opened_event_id
      AND e.ledger_id=l.ledger_id AND e.category_id=l.category_id AND e.status='active'
    WHERE l.ledger_id=? AND l.category_id=?`, scope);
  const lots: CryptoCalendarLot[] = lotRows.map((row: any) => ({ id: Number(row.id), symbol: row.symbol,
    initialQuantity: sourceNumber(row.initial_quantity), unitCost: sourceNumber(row.unit_cost),
    openingFee: row.opening_fee == null ? null : sourceNumber(row.opening_fee), openedDate: sourceDate(row, row.symbol),
    actualTradedAt: wallIso(row.actual_traded_at), registeredAt: wallIso(row.registered_at) }));
  const [saleRows] = await conn.execute(`SELECT a.lot_id,e.id AS sell_event_id,a.quantity,e.execution_price,e.quantity AS event_quantity,e.transaction_fee,l.symbol,
    DATE_FORMAT(e.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at,
    DATE_FORMAT(e.server_registered_at,'%Y-%m-%d %H:%i:%s') AS registered_at,
    DATE_FORMAT(e.settlement_effective_date,'%Y-%m-%d') AS effective_date
    FROM ledger_stock_event_lot_allocations a INNER JOIN ledger_stock_events e ON e.id=a.event_id
      AND e.status='active' AND e.event_type IN ('reduce','sell')
    INNER JOIN ledger_stock_lots l ON l.id=a.lot_id AND l.ledger_id=e.ledger_id AND l.category_id=e.category_id
    INNER JOIN ledger_stock_events opening ON opening.id=l.opened_event_id AND opening.status='active'
    WHERE e.ledger_id=? AND e.category_id=?`, scope);
  const sales: CryptoCalendarSale[] = saleRows.map((row: any) => ({ lotId: Number(row.lot_id), quantity: sourceNumber(row.quantity),
    salePrice: sourceNumber(row.execution_price), transactionFee: row.transaction_fee == null ? null : sourceNumber(row.transaction_fee),
    eventQuantity: sourceNumber(row.event_quantity), closeDate: sourceDate(row, row.symbol), eventId: Number(row.sell_event_id),
    countedSalePrice: countedSalePrice(Number(row.lot_id), Number(row.sell_event_id), sourceNumber(row.execution_price)),
    soldAt: wallIso(row.actual_traded_at) ?? undefined }));
  const [participationRows] = await conn.execute(`SELECT p.id,p.lot_id,p.user_id,p.allocated_quantity,p.remaining_quantity,p.entry_price,
    DATE_FORMAT(p.start_date,'%Y-%m-%d') AS start_date,DATE_FORMAT(p.pause_date,'%Y-%m-%d') AS pause_date,
    DATE_FORMAT(p.assigned_at,'%Y-%m-%d %H:%i:%s') AS assigned_at,DATE_FORMAT(p.updated_at,'%Y-%m-%d %H:%i:%s') AS updated_at
    FROM ledger_stock_lot_participations p INNER JOIN ledger_stock_lots l ON l.id=p.lot_id
      AND l.ledger_id=p.ledger_id AND l.category_id=p.category_id
    INNER JOIN ledger_stock_events e ON e.id=l.opened_event_id AND e.status='active'
    WHERE p.ledger_id=? AND p.category_id=?`, scope);
  const participations: CryptoCalendarParticipation[] = participationRows.map((row: any) => ({ id: Number(row.id), lotId: Number(row.lot_id), userId: Number(row.user_id),
    allocatedQuantity: sourceNumber(row.allocated_quantity), remainingQuantity: sourceNumber(row.remaining_quantity), entryPrice: sourceNumber(row.entry_price),
    startDate: row.start_date ?? null, pauseDate: row.pause_date ?? null, assignedAt: wallIso(row.assigned_at), updatedAt: wallIso(row.updated_at) }));
  const [closureRows] = await conn.execute(`SELECT c.participation_id,c.sell_event_id,p.lot_id,c.quantity,c.sale_price,l.symbol,
    DATE_FORMAT(e.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at,
    DATE_FORMAT(e.server_registered_at,'%Y-%m-%d %H:%i:%s') AS registered_at,
    DATE_FORMAT(e.settlement_effective_date,'%Y-%m-%d') AS effective_date
    FROM ledger_stock_participation_closures c INNER JOIN ledger_stock_lot_participations p ON p.id=c.participation_id
    INNER JOIN ledger_stock_lots l ON l.id=p.lot_id AND l.ledger_id=p.ledger_id AND l.category_id=p.category_id
    INNER JOIN ledger_stock_events e ON e.id=c.sell_event_id AND e.ledger_id=p.ledger_id AND e.category_id=p.category_id AND e.status='active'
    WHERE p.ledger_id=? AND p.category_id=?`, scope);
  const closures: CryptoCalendarClosure[] = closureRows.map((row: any) => ({ participationId: Number(row.participation_id),
    quantity: sourceNumber(row.quantity), salePrice: sourceNumber(row.sale_price), closeDate: sourceDate(row, row.symbol),
    eventId: Number(row.sell_event_id), countedSalePrice: countedSalePrice(Number(row.lot_id), Number(row.sell_event_id), sourceNumber(row.sale_price)),
    soldAt: wallIso(row.actual_traded_at) ?? undefined }));
  let observations: CryptoCalendarObservation[] = [];
  try {
    const [observationRows] = await conn.execute(`SELECT o.lot_id,o.user_id,o.quantity,o.entry_price,
      DATE_FORMAT(o.start_date,'%Y-%m-%d') AS start_date,DATE_FORMAT(o.pause_date,'%Y-%m-%d') AS pause_date,
      DATE_FORMAT(o.created_at,'%Y-%m-%d %H:%i:%s') AS assigned_at,DATE_FORMAT(o.updated_at,'%Y-%m-%d %H:%i:%s') AS updated_at
      FROM ledger_stock_lot_observations o INNER JOIN ledger_stock_lots l ON l.id=o.lot_id
        AND l.ledger_id=o.ledger_id AND l.category_id=o.category_id
      INNER JOIN ledger_stock_events e ON e.id=l.opened_event_id AND e.status='active'
      WHERE o.ledger_id=? AND o.category_id=? AND o.enabled=1`, scope);
    observations = observationRows.map((row: any) => ({ lotId: Number(row.lot_id), userId: Number(row.user_id), quantity: sourceNumber(row.quantity),
      entryPrice: sourceNumber(row.entry_price), startDate: row.start_date, pauseDate: row.pause_date ?? null,
      assignedAt: wallIso(row.assigned_at), updatedAt: wallIso(row.updated_at) }));
  } catch (error) { if (!missingTable(error)) throw error; }
  return { lots, sales, participations, closures, observations, downsideRules, downsideMemberEpochs };
}

async function savedStockProofs(conn: any, categoryId: number): Promise<CryptoCalendarQuote[]> {
  try {
    const [rows] = await conn.execute(`SELECT symbol,price,currency,source,DATE_FORMAT(session_date,'%Y-%m-%d') AS price_date,
      DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s') AS captured_at FROM ledger_stock_unified_close_prices
      WHERE ledger_id=? AND category_id=? ORDER BY captured_at ASC`, [LEDGER_ID, categoryId]);
    return rows.filter((r: any) => parsePortfolioInstrument(r.symbol)?.market !== 'CRYPTO').map((r: any) => ({ symbol: r.symbol,
      price: sourceNumber(r.price), currency: r.currency, source: r.source, priceDate: r.price_date, updatedAt: wallIso(r.captured_at) ?? '' }));
  } catch (error) { if (missingTable(error)) return []; throw error; }
}
async function savedUsdFx(conn: any, categoryId: number, anchor: string): Promise<StockUsdCnyClosePoint | null> {
  try {
    // Fixed USD/CNY table has no pair column; expose its schema meaning, never relabel USDT.
    const [rows] = await conn.execute(`SELECT ledger_id,category_id,policy_version,'USD/CNY' AS pair,
      DATE_FORMAT(snapshot_date,'%Y-%m-%d') AS snapshot_date,
      usd_cny_rate,source,DATE_FORMAT(quote_as_of,'%Y-%m-%d %H:%i:%s') AS as_of,
      DATE_FORMAT(locked_at,'%Y-%m-%d %H:%i:%s') AS locked_at FROM ledger_stock_unified_close_fx
      WHERE ledger_id=? AND category_id=? AND snapshot_date=? AND policy_version=?`, [LEDGER_ID, categoryId, anchor, STOCK_POLICY]);
    return validateCryptoSavedUsdAnchor(rows, { ledgerId: LEDGER_ID, categoryId, anchor });
  } catch (error) { if (missingTable(error)) return null; throw error; }
}

async function legacyBaseline(conn: any, categoryId: number, activationDate: string, history: Awaited<ReturnType<typeof readHistory>>, quotes: CryptoCalendarQuote[]) {
  const date = previousStockMarketSession(activationDate, 'A');
  if (!date) return null;
  let total: MemberCalendarSnapshot | undefined;
  // Only consume the stored derived total, never recalculate or write old stock amounts.
  try {
    const [rows] = await conn.execute(`SELECT payload,payload_encoding FROM ledger_stock_calendar_results
      WHERE ledger_id=? AND category_id=? AND policy_version=? AND computed_at IS NOT NULL`, [LEDGER_ID, categoryId, STOCK_POLICY]);
    if (rows[0]?.payload) total = decodeStockCalendarResult(rows[0].payload, rows[0].payload_encoding).find(r => r.snapshotDate === date && r.ready);
  } catch (error) { if (!missingTable(error)) throw error; }
  const fx = await savedUsdFx(conn, categoryId, date);
  const members: Record<string, MemberCalendarSnapshot> = {};
  // No persisted legacy member payload table exists. Reconstruction is admissible only with
  // unchanged, pre-cutoff configuration + already-saved exact historical quote/FX evidence.
  const priorDates = cryptoPortfolioStockAnchor(date);
  for (const userId of Array.from(new Set(history.participations.map(p => p.userId)))) {
    const ps = history.participations.filter(p => {
      if (p.userId !== userId) return false;
      const lot = history.lots.find(l => l.id === p.lotId), instrument = parsePortfolioInstrument(lot?.symbol);
      if (!lot || !instrument || instrument.market === 'CRYPTO') return false;
      // A genuinely later physical opening (e.g. Friday-night US) never belonged to this
      // prior A+overnight-US snapshot. Do NOT use mutable participation startDate to exempt old lots.
      const actual = Date.parse(lot.actualTradedAt ?? ''), registered = Date.parse(lot.registeredAt ?? '');
      const assigned = Date.parse(p.assignedAt ?? ''), cutoff = cryptoPortfolioCutoffAt(date).getTime();
      const provenLaterOpening = priorDates && lot.openedDate && lot.openedDate > priorDates[instrument.market]
        && Number.isFinite(actual) && Number.isFinite(registered) && Number.isFinite(assigned)
        && actual > cutoff && registered >= actual && assigned >= registered
        && marketDateFromTimestamp(actual / 1000, instrument.market) === lot.openedDate;
      return !provenLaterOpening;
    });
    if (!ps.length) continue; // Unknown prior member scope is pending, not a fabricated zero.
    if (ps.some(p => !p.updatedAt || Date.parse(p.updatedAt) >= cryptoPortfolioCutoffAt(date).getTime())) continue;
    const snapshot = buildMemberStockCalendar({ participations: ps.map(p => {
      const lot = history.lots.find(l => l.id === p.lotId)!;
      return { id: p.id, symbol: lot.symbol, startDate: p.startDate ?? lot.openedDate ?? '', historyStartDate: lot.openedDate,
        participationEffectiveDate: p.startDate ?? lot.openedDate, pauseDate: p.pauseDate,
        remainingQuantity: p.remainingQuantity, entryPrice: p.entryPrice, lotId: lot.id,
        entryAt: p.entryAt ?? stockLotDownsideMemberEntryAt(p.assignedAt!, p.startDate ?? lot.openedDate ?? ''), assignedAt: p.assignedAt! };
    }), closures: history.closures.filter(c => ps.some(p => p.id === c.participationId)).map(c => {
      const p = ps.find(p => p.id === c.participationId)!;
      const lot = history.lots.find(lot => lot.id === p.lotId)!;
      const offset = stockLotDownsideMemberOffset({ lotId: lot.id, participationId: p.id, assignedAt: p.assignedAt!,
        rules: history.downsideRules, epochs: history.downsideMemberEpochs,
        asOf: c.soldAt ?? stockLotDownsidePriceAsOf(lot.symbol, c.closeDate ?? '') });
      return { ...c, closeDate: c.closeDate ?? '', countedSalePrice: c.countedSalePrice === undefined ? undefined
        : offset === null ? null : c.countedSalePrice - offset };
    }),
      quotes: quotes.map(q => ({ ...q, capturedAt: q.updatedAt })), fx: fx ? [{ ...fx }] : [], candidateDates: [date],
      now: cryptoPortfolioCutoffAt(date), downsideRules: history.downsideRules,
      downsideMemberEpochs: history.downsideMemberEpochs }).find(r => r.snapshotDate === date && r.ready);
    if (snapshot) members[String(userId)] = snapshot;
  }
  return { snapshotDate: date, total, members };
}

export type CryptoPortfolioPublicationResult = { categories: number; published: number; alreadyPublished: number; skipped: number; snapshotDate: string;
  failures?: Array<{ categoryId: number; snapshotDate: string; reason: string; missingSymbols?: string[] }> };

export async function publishCryptoPortfolioSnapshots(options: { snapshotDate?: string; categoryId?: number } = {}): Promise<CryptoPortfolioPublicationResult> {
  const now = new Date(), snapshotDate = options.snapshotDate ?? latestCryptoPortfolioSnapshotDate(now);
  if (!isStockSessionDate(snapshotDate)) throw new Error('数字币日结日期无效');
  if (options.categoryId !== undefined) validateId(options.categoryId);
  const result: CryptoPortfolioPublicationResult = { categories: 0, published: 0, alreadyPublished: 0, skipped: 0, snapshotDate };
  if (now.getTime() < cryptoPortfolioCutoffAt(snapshotDate).getTime()) return result;
  await ensureCryptoPortfolioSettlementTables();
  const conn = await getDbConnection(); if (!conn) throw new Error('数据库连接不可用');
  const [categories] = await (conn as any).execute(`SELECT DISTINCT category.id FROM ledger_categories category
    WHERE category.ledgerId=? AND category.parentId IS NULL AND category.accounting_mode='stock_portfolio'
      AND (EXISTS (SELECT 1 FROM ledger_stock_lots l
        INNER JOIN ledger_stock_events opening ON opening.id=l.opened_event_id AND opening.status='active'
          AND opening.ledger_id=l.ledger_id AND opening.category_id=l.category_id
        WHERE l.ledger_id=category.ledgerId AND l.category_id=category.id AND l.symbol LIKE 'CRYPTO:%-USDT')
      OR EXISTS (SELECT 1 FROM ledger_crypto_portfolio_daily_snapshots saved
        WHERE saved.ledger_id=category.ledgerId AND saved.category_id=category.id AND saved.policy_version=?))
      ${options.categoryId !== undefined ? 'AND category.id=?' : ''}`,
    options.categoryId !== undefined ? [LEDGER_ID, POLICY, options.categoryId] : [LEDGER_ID, POLICY]);
  for (const category of Array.from(categories as any[])) {
    const categoryId = Number(category.id); result.categories++;
    let tx: any = null, locked = false, started = false;
    const lockName = `crypto37:${categoryId}:${snapshotDate}:v1`;
    try {
      tx = await getDbTransactionConnection(); if (!tx) throw new Error('transaction_unavailable');
      const [lock] = await tx.execute('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
      locked = Number(lock[0]?.acquired) === 1; if (!locked) throw new Error('publication_busy');
      // Short-circuit BEFORE any history/quote/FX reads: edit/delete/retry cannot change saved numbers.
      if (await readPayload(tx, categoryId, snapshotDate)) { result.alreadyPublished++; continue; }
      await tx.beginTransaction(); started = true;
      const { activationDate, persistedActivation } = await readActivationState(tx, categoryId);
      if (!activationDate || snapshotDate < activationDate) { await tx.rollback(); started = false; result.skipped++; continue; }
      const history = await readHistory(tx, categoryId), dates = cryptoPortfolioStockAnchor(snapshotDate);
      if (!dates) throw new Error('missing_stock_anchor');
      const stockProofs = await savedStockProofs(tx, categoryId);
      const symbols = [...Array.from(new Set(history.lots.filter(l => l.openedDate && l.openedDate <= dates[parsePortfolioInstrument(l.symbol)!.market]).map(l => l.symbol)))];
      // Include paused scopes' exact historical date; the payload builder refuses current-price fallback.
      const quoteDates = new Set([snapshotDate, ...Array.from(history.participations.map(p => p.pauseDate)), ...Array.from(history.observations.map(o => o.pauseDate))].filter(isStockSessionDate));
      const cryptoSymbols = symbols.filter(isCryptoPortfolioSymbol), stockSymbols = symbols.filter(s => !isCryptoPortfolioSymbol(s));
      const quotes: CryptoCalendarQuote[] = [...Array.from(stockProofs)];
      const hasUsdt = cryptoSymbols.length > 0, hasUsd = symbols.some(s => parsePortfolioInstrument(s)?.currency === 'USD');
      // Read once on this transaction, including crypto-only scopes: weekend bridge needs the saved A anchor.
      const savedUsd = hasUsdt || hasUsd ? await savedUsdFx(tx, categoryId, dates.A) : null;
      let usdFlight: Promise<StockUsdCnyClosePoint | null> | null = null;
      const getUsdClose = () => usdFlight ??= savedUsd ? Promise.resolve(savedUsd)
        : fetchStockUsdCnyAtClose(dates.A).then(point => validateCryptoUsdCnyClosePoint(point, dates.A), () => null);
      const usdtPromise = hasUsdt ? fetchCryptoUsdtCnyAtClose(snapshotDate, {
        usdCnyClose: savedUsd, fetchUsdCnyAtClose: getUsdClose,
      }) : Promise.resolve(null);
      const usdPromise = hasUsd ? getUsdClose() : Promise.resolve(null);
      const cryptoPromise = (async () => {
        for (const date of Array.from([...Array.from(quoteDates)].sort())) {
          if (date > snapshotDate) continue;
          for (let offset = 0; offset < cryptoSymbols.length; offset += 50) {
            const fetched = await fetchCryptoPortfolioCloseQuotes(cryptoSymbols.slice(offset, offset + 50), date);
            for (const [symbol, quote] of Array.from(Object.entries(fetched))) quotes.push({ ...quote, symbol });
          }
        }
      })();
      const stockPromise = (async () => {
        const missing = stockSymbols.filter(symbol => !quotes.some(q => q.symbol === symbol
          && isCryptoCalendarCloseQuote(q, dates[parsePortfolioInstrument(symbol)!.market as 'A' | 'US'])));
        if (missing.length) {
          const fetched = await fetchOvernightUnifiedCloseQuotes(missing, dates.A);
          for (const [symbol, quote] of Array.from(Object.entries(fetched))) quotes.push({ ...quote, symbol });
        }
        for (const item of Array.from([...Array.from(history.participations), ...Array.from(history.observations)])) {
          if (!item.pauseDate) continue;
          const symbol = history.lots.find(lot => lot.id === item.lotId)?.symbol;
          const market = parsePortfolioInstrument(symbol)?.market;
          if (!symbol || !market || market === 'CRYPTO' || item.pauseDate >= dates[market]) continue;
          const expected = isStockMarketSession(item.pauseDate, market) ? item.pauseDate : previousStockMarketSession(item.pauseDate, market);
          if (!expected || quotes.some(q => q.symbol === symbol && isCryptoCalendarCloseQuote(q, expected))) continue;
          // A configured US pause is a NY market date, not an A-day overnight mapping.
          const fetched = await fetchUnifiedCloseQuotes([symbol], { A: market === 'A' ? expected : dates.A, US: market === 'US' ? expected : dates.US });
          for (const [symbol, quote] of Array.from(Object.entries(fetched))) quotes.push({ ...quote, symbol });
        }
      })();
      const [usdtFx, usdFx] = await Promise.all([usdtPromise, usdPromise, cryptoPromise, stockPromise]);
      const previousDate = shiftStockSessionDate(snapshotDate, -1);
      const hasRetroRules = history.downsideRules.some(r => r.startDate && r.startDate <= snapshotDate);
      // The original fixed row remains immutable; only the derived previous is used for new daily differences.
      const previous = hasRetroRules ? (await readDerivedPayloads(tx, categoryId, activationDate, new Date()))
        .find(p => p.snapshotDate === previousDate) ?? null : await readPayload(tx, categoryId, previousDate);
      const retroBeforeActivation = history.downsideRules.some(r => r.startDate && r.startDate < activationDate);
      const baseline = snapshotDate === activationDate && !previous && !retroBeforeActivation
        ? await legacyBaseline(tx, categoryId, activationDate, history, stockProofs) : null;
      const payload = buildCryptoPortfolioDailyPayload({ categoryId, snapshotDate, activationDate, persistedActivation, now: new Date(),
        ...history, quotes, usdtFx, usdFx, previous, baseline, captureHistoryEvidence: true });
      const snapshots = [payload.total, ...Array.from(Object.values(payload.members)), ...Array.from(Object.values(payload.observations))];
      if (snapshots.some(s => !s.ready)) {
        const missingSymbols = [...Array.from(new Set(snapshots.flatMap(s => s.missingSymbols)))];
        const missingBaseline = snapshots.some(s => s.dailyPnlReason === 'missing_downside_member_baseline');
        const missingSale = snapshots.some(s => s.dailyPnlReason === 'missing_downside_sale_evidence');
        throw Object.assign(new Error(missingSymbols.length ? 'missing_verified_close' : missingSale
          ? 'missing_downside_sale_evidence' : missingBaseline
          ? 'missing_downside_member_baseline' : 'missing_historical_fx'), { missingSymbols });
      }
      const [insert] = await tx.execute(`INSERT IGNORE INTO ledger_crypto_portfolio_daily_snapshots
        (ledger_id,category_id,snapshot_date,policy_version,activation_date,payload) VALUES (?,?,?,?,?,?)`,
        [LEDGER_ID, categoryId, snapshotDate, POLICY, activationDate, JSON.stringify(payload)]);
      if (Number(insert.affectedRows) === 1) {
        // Same transaction: cache generation only changes once per newly inserted publication.
        await markStockCalendarResultDirty(tx, categoryId);
        await tx.commit(); started = false; result.published++;
      } else {
        // INSERT IGNORE is not evidence of success. An immutable row must actually exist.
        if (!await readPayload(tx, categoryId, snapshotDate)) throw new Error('publication_insert_ignored');
        await tx.commit(); started = false; result.alreadyPublished++;
      }
    } catch (error: any) {
      if (started) { try { await tx.rollback(); } catch { /* Never publish or claim success after rollback failure. */ } }
      result.skipped++;
      const allowed = new Set(['publication_busy', 'missing_verified_close', 'missing_historical_fx', 'invalid_trade_history', 'invalid_sale_history',
        'invalid_crypto_effective_date', 'unverifiable_allocation_history', 'unverifiable_observation_history', 'publication_insert_ignored',
        'missing_downside_member_baseline', 'invalid_downside_sale_evidence', 'missing_downside_sale_evidence']);
      (result.failures ??= []).push({ categoryId, snapshotDate, reason: allowed.has(error?.message) ? error.message : 'publication_failed',
        ...(error?.missingSymbols ? { missingSymbols: error.missingSymbols } : {}) });
    } finally {
      if (locked) { try { await tx.execute('SELECT RELEASE_LOCK(?)', [lockName]); } catch { /* lock is connection scoped */ } }
      if (typeof tx?.release === 'function') tx.release();
    }
  }
  return result;
}

const derivedCalendarCaches = new WeakMap<object, Map<string, { until: number; promise: Promise<CryptoPortfolioDailyPayload[]> }>>();
async function readRevaluedStockBaseline(conn: any, categoryId: number, activationDate: string,
  payloads: readonly CryptoPortfolioDailyPayload[], now: Date) {
  const date = previousStockMarketSession(activationDate, 'A'); if (!date) return null;
  // Lazy internal SELECT-only helper avoids the core module cycle; never imports routers or starts a server.
  const { readStockLotDownsideCalendarBaseline } = await import('./ledger-stock-portfolio');
  const total = await readStockLotDownsideCalendarBaseline(categoryId, date, undefined, conn, now);
  const members: Record<string, MemberCalendarSnapshot> = {};
  for (const userId of Object.keys(payloads[0]?.members ?? {})) {
    const member = await readStockLotDownsideCalendarBaseline(categoryId, date, Number(userId), conn, now);
    if (member?.ready) members[userId] = member;
  }
  return { snapshotDate: date, total: total?.ready ? total : undefined, members };
}
async function readDerivedPayloads(conn: any, categoryId: number, activationDate: string, now: Date): Promise<CryptoPortfolioDailyPayload[]> {
  // Fresh, scoped revision read invalidates derived cache immediately after a save; no stale 15s rule cache.
  const rules = await readStockLotDownsideRules(conn, LEDGER_ID, categoryId, true);
  const retro = rules.some(r => r.startDate && r.startDate <= cryptoPortfolioBeijingDate(now));
  const load = async () => {
    let rows: any[];
    try {
      [rows] = await conn.execute(`SELECT payload FROM ledger_crypto_portfolio_daily_snapshots
        WHERE ledger_id=? AND category_id=? AND policy_version=? AND snapshot_date>=? AND snapshot_date<=? ORDER BY snapshot_date ASC`,
        [LEDGER_ID, categoryId, POLICY, activationDate, cryptoPortfolioBeijingDate(now)]);
    } catch (error) { if (!missingTable(error)) throw error; rows = []; }
    const originals = rows.map(r => decodePayload(r.payload, categoryId)).filter(p =>
      cryptoPortfolioCutoffAt(p.snapshotDate).getTime() <= now.getTime() && Date.parse(p.publishedAt) <= now.getTime());
    if (!retro || !originals.length) return originals;
    const history = await readHistory(conn, categoryId, rules);
    const historicalQuotes = await savedStockProofs(conn, categoryId);
    const baseline = rules.some(r => r.startDate && r.startDate < activationDate)
      ? await readRevaluedStockBaseline(conn, categoryId, activationDate, originals, now) : null;
    return revalueCryptoPortfolioDailyPayloads({ categoryId, originalPayloads: originals,
      history: { ...history, historicalQuotes }, baseline, now }).payloads;
  };
  if (!retro) return load(); // Exact legacy/no-startDate path has no new history/economic queries.
  let cache = derivedCalendarCaches.get(conn); if (!cache) { cache = new Map(); derivedCalendarCaches.set(conn, cache); }
  const fingerprint = cryptoPortfolioDownsideFingerprint(categoryId, { downsideRules: rules });
  const key = `${categoryId}:${activationDate}:${cryptoPortfolioBeijingDate(now)}:${now.getTime() >= cryptoPortfolioCutoffAt(cryptoPortfolioBeijingDate(now)).getTime()}:${fingerprint}`;
  const saved = cache.get(key);
  if (saved && saved.until > Date.now()) return saved.promise;
  // Keep at most one revision/day per category. Failed promises are not cached.
  for (const old of Array.from(cache.keys())) if (old.startsWith(`${categoryId}:`)) cache.delete(old);
  const promise = load(); cache.set(key, { until: Date.now() + 15_000, promise });
  void promise.catch(() => { if (cache!.get(key)?.promise === promise) cache!.delete(key); });
  return promise;
}

/** SELECT-only derived read. Missing evidence/days remain pending, never live price/FX fallback. */
export async function readCryptoPortfolioCalendar(categoryId: number, userId?: number, now = new Date(), readConnection?: any): Promise<MemberCalendarSnapshot[]> {
  validateId(categoryId); if (userId !== undefined) validateId(userId);
  const conn = readConnection ?? await getDbConnection(); if (!conn) throw new Error('数据库连接不可用');
  const activationDate = await readActivation(conn, categoryId); if (!activationDate) return [];
  const payloads = await readDerivedPayloads(conn, categoryId, activationDate, now);
  // A user with no actual participation has no member calendar. Observations remain display-only
  // in stored payload; they are never silently substituted for an actual member's returns.
  if (userId !== undefined && !payloads.some(p => Object.hasOwn(p.members, String(userId)))) {
    const [eligible] = await (conn as any).execute(`SELECT p.id FROM ledger_stock_lot_participations p
      WHERE p.ledger_id=? AND p.category_id=? AND p.user_id=? LIMIT 1`, [LEDGER_ID, categoryId, userId]);
    if (!(eligible as any[]).length) return [];
  }
  const byDate = new Map(payloads.map(p => [p.snapshotDate, userId === undefined ? p.total : p.members[String(userId)]]));
  const snapshots: MemberCalendarSnapshot[] = [], today = cryptoPortfolioBeijingDate(now);
  for (let date = activationDate; date <= today; date = shiftStockSessionDate(date, 1)) snapshots.push(byDate.get(date)
    ?? pendingCryptoCalendarSnapshot(date, now.getTime() < cryptoPortfolioCutoffAt(date).getTime() ? 'awaiting_1505_close' : 'unpublished_daily_snapshot'));
  // No references into shared category cache, and never expose owner-only rule audit in member output.
  return snapshots.reverse().map(row => {
    const copy = JSON.parse(JSON.stringify(row)) as MemberCalendarSnapshot;
    if (userId !== undefined) delete copy.downsideRuleAudit;
    return copy;
  });
}

/** Existing live quote table only. No source history/day snapshots, no core ensure or dirty marks. */
export async function refreshCryptoPortfolioIntradaySnapshots(): Promise<{ categories: number; symbols: number; updated: number }> {
  if (intradayFlight) return intradayFlight;
  intradayFlight = (async () => {
    await ensureCryptoPortfolioSettlementTables();
    const conn = await getDbConnection(); if (!conn) throw new Error('数据库连接不可用');
    const [rows] = await (conn as any).execute(`SELECT l.category_id,l.symbol,l.initial_quantity,
      COALESCE(SUM(CASE WHEN sale.status='active' THEN a.quantity ELSE 0 END),0) AS sold_quantity
      FROM ledger_stock_lots l INNER JOIN ledger_categories category ON category.id=l.category_id AND category.ledgerId=l.ledger_id
      INNER JOIN ledger_stock_events opening ON opening.id=l.opened_event_id AND opening.status='active'
        AND opening.ledger_id=l.ledger_id AND opening.category_id=l.category_id
      LEFT JOIN ledger_stock_event_lot_allocations a ON a.lot_id=l.id
      LEFT JOIN ledger_stock_events sale ON sale.id=a.event_id AND sale.ledger_id=l.ledger_id AND sale.category_id=l.category_id
      WHERE l.ledger_id=? AND category.parentId IS NULL AND category.accounting_mode='stock_portfolio'
        AND l.symbol LIKE 'CRYPTO:%-USDT' GROUP BY l.id,l.category_id,l.symbol,l.initial_quantity`, [LEDGER_ID]);
    const active = (rows as any[]).filter(r => {
      const quantity = Math.round((sourceNumber(r.initial_quantity) - sourceNumber(r.sold_quantity)) * 1e8) / 1e8;
      return isCryptoPortfolioSymbol(r.symbol) && Number.isFinite(quantity) && !portfolioQuantityIsEmpty(r.symbol, quantity);
    });
    const symbols = [...Array.from(new Set(active.map(r => String(r.symbol))))];
    const quotes: Record<string, CryptoCalendarQuote> = {};
    // Sequential bounded batches; upstream additionally caps all network requests at four.
    for (let i = 0; i < symbols.length; i += 50) Object.assign(quotes, await fetchCryptoPortfolioQuotes(symbols.slice(i, i + 50)));
    const result = { categories: new Set(active.map(r => r.category_id)).size, symbols: symbols.length, updated: 0 };
    const scopes = new Set<string>(), now = Date.now();
    for (const row of Array.from(active)) {
      const key = `${row.category_id}:${row.symbol}`; if (scopes.has(key)) continue; scopes.add(key);
      const quote = quotes[row.symbol], captured = Date.parse(quote?.updatedAt ?? '');
      if (!quote || quote.symbol !== row.symbol || quote.currency !== 'USDT' || !Number.isFinite(quote.price) || quote.price <= 0
        || !Number.isFinite(captured) || captured > now || now - captured > 120_000 || quote.priceDate !== cryptoPortfolioBeijingDate(new Date(captured))) continue;
      const wall = new Date(captured + 8 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
      await (conn as any).execute(`INSERT INTO ledger_stock_intraday_quotes (ledger_id,category_id,symbol,price,price_date,captured_at)
        VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
        price=IF(VALUES(captured_at)>=captured_at,VALUES(price),price),
        price_date=IF(VALUES(captured_at)>=captured_at,VALUES(price_date),price_date),
        captured_at=GREATEST(captured_at,VALUES(captured_at))`, [LEDGER_ID, row.category_id, row.symbol, quote.price, quote.priceDate, wall]);
      result.updated++;
    }
    return result;
  })().finally(() => { intradayFlight = null; });
  return intradayFlight;
}
