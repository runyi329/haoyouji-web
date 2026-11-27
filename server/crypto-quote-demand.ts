import { CRYPTO_ASSET_CODES, isCryptoAssetCode, type CryptoAssetCode } from '../shared/crypto-asset-catalog';

/** The catalog is a validation bound, NEVER an eager quote request list. */
export const MAX_ACTIVE_CRYPTO_QUOTE_SYMBOLS = CRYPTO_ASSET_CODES.length;
export const CRYPTO_QUOTE_DEMAND_LEASE_MS = 120_000;
export const CRYPTO_QUOTE_DEMAND_GRACE_MS = 300_000;
export const CRYPTO_QUOTE_DEMAND_REFRESH_MS = 30_000;
const MAX_LEASE_MS = 1_800_000;

/** Exact old price-scanner CRYPTO_COINS, not all 216 catalog entries. */
export const LEGACY_CRYPTO_QUOTE_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'HYPE', 'TRUMP', 'PENGU', 'XPL', 'WLFI', 'AVAX',
  'DOGE', 'XLM', 'TIA', 'EIGEN', 'FET', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO',
  'ENA', 'ARKM', 'UNI', 'SEI', 'PLUME', 'ADA', 'ZRO', 'WLD', 'LINK', 'POL',
  'CRV', 'PEPE', 'B2', 'TAO', 'PENDLE', 'NEAR', 'INJ', 'STRK', 'BTY',
] as const satisfies readonly CryptoAssetCode[];

export const CRYPTO_QUOTE_SYSTEM_PINS = {
  BTC: 'af-tier-scanner COIN_SYMBOLS / routers AF委托与持仓总估值固定读取BTC ETH SOL；不依赖页面存活',
  ETH: 'prediction-router 自动亏损买入和结算读取ETH现货；AF委托估值。ETH_PERP独立标记价不属于此现货集合',
  SOL: 'af-tier-scanner COIN_SYMBOLS / routers AF委托与持仓总估值固定读取BTC ETH SOL；不依赖页面存活',
} as const satisfies Partial<Record<CryptoAssetCode, string>>;

export function normalizeCryptoQuoteDemandSymbol(raw: unknown): CryptoAssetCode | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toUpperCase();
  const explicit = /^CRYPTO:([A-Z0-9]+)-USDT$/.exec(text);
  const base = explicit ? explicit[1] : text;
  return isCryptoAssetCode(base) ? base : null;
}

/** Only decimal strings (or exact integers) are accepted; no float/epsilon nonzero test. */
export function cryptoDemandDecimalIsNonzero(raw: unknown): boolean {
  if (typeof raw === 'bigint') return raw !== BigInt(0);
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw)) throw new Error('inexact_numeric_quantity');
    return raw !== 0;
  }
  if (typeof raw !== 'string' || !/^[+-]?\d+(?:\.\d+)?$/.test(raw.trim())) {
    throw new Error('invalid_decimal_quantity');
  }
  return /[1-9]/.test(raw);
}

type Row = Record<string, unknown>;
/** Query injection returns rows ONLY, not mysql2's [rows, fields] tuple. */
export type CryptoQuoteDemandQuery = (sql: string, values: readonly unknown[]) => Promise<readonly Row[]>;
type Source = { id: string; sql: string; values: readonly unknown[]; collect: (rows: readonly Row[]) => Set<CryptoAssetCode> };

function requireFields(row: Row, fields: readonly string[]): void {
  if (!row || typeof row !== 'object' || Array.isArray(row) || fields.some(field => !Object.hasOwn(row, field))) {
    throw new Error('missing_required_result_field');
  }
}
function normalizedSet(symbols: readonly string[]): Set<CryptoAssetCode> {
  const result = new Set<CryptoAssetCode>();
  for (const raw of symbols) {
    const symbol = normalizeCryptoQuoteDemandSymbol(raw);
    if (symbol) result.add(symbol);
  }
  return result;
}
function addSymbol(result: Set<CryptoAssetCode>, raw: unknown): void {
  const symbol = normalizeCryptoQuoteDemandSymbol(raw);
  if (symbol) result.add(symbol);
  else if (typeof raw === 'string' && raw.trim().toUpperCase().startsWith('CRYPTO:')) {
    // Explicit crypto outside the catalog cannot be silently treated as an empty source.
    throw new Error('unsupported_explicit_crypto_symbol');
  }
}
function parseJson(raw: unknown, kind: 'object' | 'array'): Row | unknown[] {
  let parsed: unknown = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  if (parsed == null || parsed === '') return kind === 'array' ? [] : {};
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { throw new Error('malformed_demand_json'); }
  }
  if (kind === 'array' ? !Array.isArray(parsed) : !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid_demand_json_shape');
  }
  return parsed as Row | unknown[];
}
function collectBalances(rows: readonly Row[]): Set<CryptoAssetCode> {
  const result = new Set<CryptoAssetCode>();
  for (const row of rows) {
    requireFields(row, ['asset_code', 'available_balance', 'frozen_balance']);
    // Evaluate BOTH fields, so a bad/missing frozen value cannot hide behind available != 0.
    const available = cryptoDemandDecimalIsNonzero(row.available_balance);
    const frozen = cryptoDemandDecimalIsNonzero(row.frozen_balance);
    if (available || frozen) addSymbol(result, row.asset_code);
  }
  return result;
}
function collectQuantities(rows: readonly Row[]): Set<CryptoAssetCode> {
  const result = new Set<CryptoAssetCode>();
  for (const row of rows) {
    requireFields(row, ['asset_code', 'quantity']);
    if (cryptoDemandDecimalIsNonzero(row.quantity)) addSymbol(result, row.asset_code);
  }
  return result;
}
const ENDED_ORDER_STATES = new Set(['settled', 'completed', 'cancelled']);
function orderIsEnded(row: Row): boolean {
  if (row.settlement_snapshot != null) return true;
  if (row.status == null || row.status === '') return false; // Partial legacy participant/segment inherits parent.
  const status = String(row.status).trim().toLowerCase();
  if (ENDED_ORDER_STATES.has(status)) return true;
  if (status !== 'active') throw new Error('unrecognized_ledger_order_status');
  return false;
}
function collectAssetArray(result: Set<CryptoAssetCode>, raw: unknown): void {
  for (const value of parseJson(raw, 'array') as unknown[]) {
    const asset = value as Row;
    requireFields(asset, ['coin', 'qty']);
    const symbol = normalizeCryptoQuoteDemandSymbol(asset.coin);
    // Securities and funding assets are not crypto demand; their qty format is immaterial here.
    if (symbol && cryptoDemandDecimalIsNonzero(asset.qty)) result.add(symbol);
    else if (!symbol) addSymbol(new Set(), asset.coin);
  }
}
function collectOrderAssets(result: Set<CryptoAssetCode>, row: Row): void {
  if (orderIsEnded(row)) return;
  // An active unfilled/zero-quantity order still needs its selected coin/amount currency.
  for (const field of ['coin', 'amount_currency', 'interest_base_currency', 'interest_rate_currency']) {
    addSymbol(result, row[field]);
  }
  if (normalizeCryptoQuoteDemandSymbol(row.collateral_coin)) {
    if (row.collateral_qty == null || row.collateral_qty === '') throw new Error('missing_collateral_quantity');
    if (cryptoDemandDecimalIsNonzero(row.collateral_qty)) addSymbol(result, row.collateral_coin);
  }
  collectAssetArray(result, row.collateral_assets);
  collectAssetArray(result, row.lent_out_assets);
  const option = parseJson(row.option_info, 'object') as Row;
  addSymbol(result, option.coin);
  addSymbol(result, option.denomination);
}
const ORDER_FIELDS = ['status', 'coin', 'amount_currency', 'interest_base_currency', 'interest_rate_currency',
  'collateral_coin', 'collateral_qty', 'collateral_assets', 'lent_out_assets', 'option_info'] as const;
function collectOrders(rows: readonly Row[]): Set<CryptoAssetCode> {
  const result = new Set<CryptoAssetCode>();
  for (const row of rows) {
    requireFields(row, ORDER_FIELDS);
    collectOrderAssets(result, row);
  }
  return result;
}
function collectParticipants(rows: readonly Row[]): Set<CryptoAssetCode> {
  const result = new Set<CryptoAssetCode>();
  for (const row of rows) {
    requireFields(row, [...ORDER_FIELDS, 'order_snapshot', 'participant_amount_currency', 'participant_interest_base_currency', 'participant_interest_rate_currency']);
    if (orderIsEnded(row)) continue;
    const snapshot = parseJson(row.order_snapshot, 'object') as Row;
    // Parent completion applies to every participant; otherwise each participant is independent.
    if (orderIsEnded(snapshot)) continue;
    const effective = { ...row, ...snapshot };
    if (!Object.hasOwn(snapshot, 'amount_currency') && row.participant_amount_currency) effective.amount_currency = row.participant_amount_currency;
    if (!Object.hasOwn(snapshot, 'interest_base_currency') && row.participant_interest_base_currency) effective.interest_base_currency = row.participant_interest_base_currency;
    if (!Object.hasOwn(snapshot, 'interest_rate_currency') && row.participant_interest_rate_currency) effective.interest_rate_currency = row.participant_interest_rate_currency;
    const primary = parseJson(snapshot.joint_order_primary_settlement, 'object') as Row;
    if (!orderIsEnded(primary)) collectOrderAssets(result, effective);
    for (const value of parseJson(snapshot.joint_order_segments, 'array') as unknown[]) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_joint_segment');
      const segment = value as Row;
      // Do not inherit primary settlement_snapshot/status into still-active later segments.
      if (!orderIsEnded(segment)) collectOrderAssets(result, { ...effective, settlement_snapshot: null, status: 'active', ...segment });
    }
  }
  return result;
}

/** ledger_members initial_balances stores current __margins / legacy __margin, NOT dividend/history rows. */
function collectConfiguredMargins(rows: readonly Row[]): Set<CryptoAssetCode> {
  const result = new Set<CryptoAssetCode>();
  const scale = BigInt('1000000000000000000');
  const exactUnits = (raw: unknown): bigint => {
    cryptoDemandDecimalIsNonzero(raw); // Reject float/exponent/missing quantity rather than fake exactness.
    const text = String(raw).trim();
    const match = /^([+-]?)(\d+)(?:\.(\d{1,18}))?$/.exec(text);
    if (!match) throw new Error('invalid_margin_decimal_precision');
    const units = BigInt(match[2]) * scale + BigInt((match[3] ?? '').padEnd(18, '0'));
    return match[1] === '-' ? -units : units;
  };
  for (const row of rows) {
    requireFields(row, ['initial_balances']);
    const config = parseJson(row.initial_balances, 'object') as Row;
    const tags = new Set(Object.keys(config).filter(key => key.endsWith('__margins') || key.endsWith('__margin'))
      .map(key => key.replace(/__(?:margins|margin)$/, '')));
    for (const tag of Array.from(tags)) {
      const entries = parseJson(config[`${tag}__margins`], 'array') as unknown[];
      const legacy = config[`${tag}__margin`];
      if (!entries.length && legacy != null && legacy !== '') entries.push({
        coin: config[`${tag}__marginCoin`] || 'CNY', amount: legacy,
      });
      const net = new Map<CryptoAssetCode, bigint>();
      for (const value of entries) {
        const entry = value as Row;
        requireFields(entry, ['amount']);
        const symbol = normalizeCryptoQuoteDemandSymbol(entry.coin || 'CNY');
        if (!symbol) { addSymbol(new Set(), entry.coin); continue; }
        net.set(symbol, (net.get(symbol) ?? BigInt(0)) + exactUnits(entry.amount));
      }
      // Positive/negative corrections are netted per member + tag + coin; never activate old zero-net entries.
      for (const [symbol, quantity] of Array.from(net)) if (quantity !== BigInt(0)) result.add(symbol);
    }
  }
  return result;
}

/** Global backend-only union across users/tenants; no invented tenant_id and no historical entries SELECT. */
export const CRYPTO_QUOTE_DEMAND_SOURCES: readonly Source[] = [
  {
    id: 'wallet-balances', values: [], collect: collectBalances,
    sql: `SELECT asset_code, CAST(MAX(ABS(available_balance)) AS CHAR) AS available_balance,
      CAST(MAX(ABS(frozen_balance)) AS CHAR) AS frozen_balance
      FROM ai_wallet_asset_balances WHERE available_balance <> 0 OR frozen_balance <> 0
      GROUP BY asset_code`,
  },
  {
    id: 'wallet-project-holds', values: [], collect: collectQuantities,
    sql: `SELECT asset_code, CAST(MAX(amount - COALESCE(released_amount, 0)) AS CHAR) AS quantity
      FROM ai_wallet_project_holds WHERE status = 'active' AND amount > COALESCE(released_amount, 0)
      GROUP BY asset_code`,
  },
  {
    // The REAL table is ai_wallet_asset_collateral_locks, NOT ai_wallet_asset_locks.
    id: 'wallet-collateral-locks', values: [], collect: collectQuantities,
    sql: `SELECT asset_code, CAST(MAX(ABS(amount)) AS CHAR) AS quantity
      FROM ai_wallet_asset_collateral_locks WHERE status = 'active' AND amount <> 0 GROUP BY asset_code`,
  },
  {
    id: 'wallet-manual-freezes', values: [], collect: collectQuantities,
    sql: `SELECT asset_code, CAST(MAX(amount - released_amount) AS CHAR) AS quantity
      FROM ai_wallet_manual_freezes WHERE status = 'active' AND amount > released_amount GROUP BY asset_code`,
  },
  {
    // routers getLedger37MarginMigrationReconciliationSnapshot verifies camel ledgerId and snake initial_balances.
    id: 'ledger37-configured-margins', values: [37], collect: collectConfiguredMargins,
    sql: `SELECT initial_balances FROM ledger_members WHERE ledgerId = ? AND initial_balances IS NOT NULL`,
  },
  {
    // Mirrors ledger-stock-portfolio getMyLedger37R1HoldingSnapshot; ignores observations/history.
    id: 'ledger37-real-holdings', values: [37], collect: collectQuantities,
    sql: `SELECT current_lots.symbol AS asset_code, CAST(SUM(current_lots.remaining_quantity) AS CHAR) AS quantity
      FROM (
        SELECT l.symbol, GREATEST(0, l.initial_quantity - COALESCE((
          SELECT SUM(a.quantity) FROM ledger_stock_event_lot_allocations a
          INNER JOIN ledger_stock_events sale ON sale.id = a.event_id
            AND sale.ledger_id = l.ledger_id AND sale.category_id = l.category_id
            AND sale.status = 'active' AND sale.event_type IN ('reduce','sell')
          WHERE a.lot_id = l.id), 0)) AS remaining_quantity
        FROM ledger_stock_lots l
        INNER JOIN ledger_categories c ON c.id = l.category_id AND c.ledgerId = l.ledger_id
          AND c.parentId IS NULL AND c.accounting_mode = 'stock_portfolio'
        INNER JOIN ledger_stock_events opening ON opening.id = l.opened_event_id
          AND opening.ledger_id = l.ledger_id AND opening.category_id = l.category_id AND opening.status = 'active'
        WHERE l.ledger_id = ? AND l.symbol LIKE 'CRYPTO:%-USDT'
      ) current_lots GROUP BY current_lots.symbol HAVING SUM(current_lots.remaining_quantity) <> 0`,
  },
  {
    id: 'ledger52-open-orders', values: [52], collect: collectOrders,
    // Include unexpected non-terminal status so the collector diagnoses it instead of silent omission.
    sql: `SELECT status, coin, amount_currency, interest_base_currency, interest_rate_currency,
      collateral_coin, CAST(collateral_qty AS CHAR) AS collateral_qty, collateral_assets, lent_out_assets, option_info
      FROM ledger_orders WHERE ledger_id = ? AND deleted_at IS NULL
        AND (status IS NULL OR status NOT IN ('settled','completed','cancelled'))`,
  },
  {
    id: 'ledger52-participant-orders', values: [52], collect: collectParticipants,
    // joint_order_segments ONLY lives inside p.order_snapshot, never a ledger_orders column.
    sql: `SELECT o.status, o.coin, o.amount_currency, o.interest_base_currency, o.interest_rate_currency,
      o.collateral_coin, CAST(o.collateral_qty AS CHAR) AS collateral_qty,
      o.collateral_assets, o.lent_out_assets, o.option_info, p.order_snapshot,
      p.amount_currency AS participant_amount_currency, p.interest_base_currency AS participant_interest_base_currency,
      p.interest_rate_currency AS participant_interest_rate_currency
      FROM ledger_order_participants p
      INNER JOIN ledger_orders o ON o.id = p.order_id AND o.ledger_id = p.ledger_id
      WHERE p.ledger_id = ? AND p.role <> 'inactive' AND o.deleted_at IS NULL
        AND (o.status IS NULL OR o.status NOT IN ('settled','completed','cancelled'))`,
  },
];

export type CryptoQuoteDemandSourceDiagnostic = {
  source: string; state: 'unknown' | 'ok' | 'failed'; symbolCount: number;
  checkedAt: number | null; lastSuccessAt: number | null; error: string | null;
};
export type CryptoQuoteDemandDiagnostic = {
  reconciled: boolean; fallbackActive: boolean; refreshing: boolean;
  lastAttemptAt: number | null; lastSuccessAt: number | null;
  activeCount: number; leaseCount: number; persistentConsumers: Record<string, number>;
  sources: CryptoQuoteDemandSourceDiagnostic[]; systemPins: typeof CRYPTO_QUOTE_SYSTEM_PINS;
};

/** No I/O, timers, credentials, DDL or imports of DB/provider/scanner on construction/import. */
export class CryptoQuoteDemandRegistry {
  private readonly leases = new Map<CryptoAssetCode, number>();
  private readonly persistent = new Map<string, Set<CryptoAssetCode>>();
  private readonly diagnostics = new Map<string, CryptoQuoteDemandSourceDiagnostic>();
  private readonly clock: () => number;
  private readonly pins: Set<CryptoAssetCode>;
  private readonly query: CryptoQuoteDemandQuery;
  private reconciled = false;
  private fallbackActive = true;
  private lastAttemptAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(options: { query: CryptoQuoteDemandQuery; now?: () => number; pins?: readonly string[] }) {
    this.query = options.query;
    this.clock = options.now ?? Date.now;
    this.pins = normalizedSet(options.pins ?? Object.keys(CRYPTO_QUOTE_SYSTEM_PINS));
    for (const { id } of CRYPTO_QUOTE_DEMAND_SOURCES) this.diagnostics.set(id, {
      source: id, state: 'unknown', symbolCount: 0, checkedAt: null, lastSuccessAt: null, error: null,
    });
  }

  touch(symbols: readonly string[], leaseMs = CRYPTO_QUOTE_DEMAND_LEASE_MS): void {
    if (!Number.isFinite(leaseMs) || leaseMs < 0) throw new Error('invalid_crypto_demand_lease');
    const expiry = this.clock() + Math.min(leaseMs, MAX_LEASE_MS) + CRYPTO_QUOTE_DEMAND_GRACE_MS;
    for (const symbol of Array.from(normalizedSet(symbols))) {
      this.leases.set(symbol, Math.max(expiry, this.leases.get(symbol) ?? 0));
    }
  }

  /** Replace this consumer ONLY; [] releases it but never releases another consumer/lease. */
  replacePersistent(consumer: string, symbols: readonly string[]): void {
    if (!consumer.trim()) throw new Error('missing_crypto_demand_consumer');
    this.persistent.set(`consumer:${consumer}`, normalizedSet(symbols));
  }

  active(now = this.clock()): string[] {
    const active = new Set<CryptoAssetCode>(this.pins);
    if (this.fallbackActive) for (const symbol of LEGACY_CRYPTO_QUOTE_SYMBOLS) active.add(symbol);
    for (const symbols of Array.from(this.persistent.values())) for (const symbol of Array.from(symbols)) active.add(symbol);
    for (const [symbol, expiry] of Array.from(this.leases)) {
      if (expiry > now) active.add(symbol);
      else this.leases.delete(symbol);
    }
    // Stable catalog order, guaranteed <= catalog length, base codes match price-scanner cache keys.
    return CRYPTO_ASSET_CODES.filter(symbol => active.has(symbol));
  }

  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const now = this.clock();
    if (this.lastAttemptAt !== null && now - this.lastAttemptAt < CRYPTO_QUOTE_DEMAND_REFRESH_MS) return Promise.resolve();
    this.lastAttemptAt = now;
    this.inFlight = this.reconcile(now).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async reconcile(now: number): Promise<void> {
    const results = await Promise.all(CRYPTO_QUOTE_DEMAND_SOURCES.map(async source => {
      try {
        const rows = await this.query(source.sql, source.values);
        if (!Array.isArray(rows)) throw new Error('invalid_query_rows');
        const symbols = source.collect(rows);
        this.diagnostics.set(source.id, { source: source.id, state: 'ok', symbolCount: symbols.size,
          checkedAt: now, lastSuccessAt: now, error: null });
        return { source: source.id, symbols };
      } catch (error) {
        const previous = this.diagnostics.get(source.id)!;
        // Never log SQL/DB credentials or driver connection URLs. Codes and our validation errors suffice.
        const code = (error as { code?: unknown } | null)?.code;
        const message = error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : 'query_failed';
        this.diagnostics.set(source.id, { ...previous, state: 'failed', checkedAt: now,
          error: typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : message });
        return { source: source.id, symbols: null };
      }
    }));
    const complete = results.every(result => result.symbols !== null);
    for (const { source, symbols } of results) {
      if (!symbols) continue;
      const key = `db:${source}`;
      // Any failure prevents ALL removals, but proven new symbols can be activated immediately.
      this.persistent.set(key, complete ? symbols : new Set([...Array.from(this.persistent.get(key) ?? []), ...Array.from(symbols)]));
    }
    this.fallbackActive = !complete;
    if (complete) {
      this.reconciled = true;
      this.lastSuccessAt = now;
    }
  }

  diagnostic(): CryptoQuoteDemandDiagnostic {
    const activeCount = this.active().length;
    return { reconciled: this.reconciled, fallbackActive: this.fallbackActive, refreshing: !!this.inFlight,
      lastAttemptAt: this.lastAttemptAt, lastSuccessAt: this.lastSuccessAt, activeCount, leaseCount: this.leases.size,
      persistentConsumers: Object.fromEntries(Array.from(this.persistent, ([key, symbols]) => [key, symbols.size])),
      sources: Array.from(this.diagnostics.values(), entry => ({ ...entry })), systemPins: CRYPTO_QUOTE_SYSTEM_PINS };
  }
}

async function defaultQuery(sql: string, values: readonly unknown[]): Promise<readonly Row[]> {
  // Import/getDbConnection occurs only in explicit scanner-driven reconcile, never during module import.
  const { getDbConnection } = await import('./db');
  const conn = await getDbConnection();
  if (!conn) throw new Error('database_unavailable');
  const result = await conn.execute(sql, [...values]);
  if (!Array.isArray(result) || !Array.isArray(result[0])) throw new Error('invalid_mysql_query_result');
  return result[0] as Row[];
}
const registry = new CryptoQuoteDemandRegistry({ query: defaultQuery });
export function touchCryptoQuoteDemand(symbols: readonly string[], leaseMs?: number): void { registry.touch(symbols, leaseMs); }
export function getActiveCryptoQuoteSymbols(now?: number): string[] { return registry.active(now); }
export function refreshPersistentCryptoQuoteDemand(): Promise<void> { return registry.refresh(); }
export function setPersistentCryptoQuoteDemand(consumer: string, symbols: readonly string[]): void { registry.replacePersistent(consumer, symbols); }
export function getCryptoQuoteDemandDiagnostics(): CryptoQuoteDemandDiagnostic { return registry.diagnostic(); }
