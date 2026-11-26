import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const db = vi.hoisted(() => ({ get: vi.fn(), tx: vi.fn() }));
const isolation = vi.hoisted(() => ({ denied: vi.fn(() => { throw new Error('real DB/network forbidden'); }) }));
vi.mock('./db', () => ({ getDbConnection: db.get, getDbTransactionConnection: db.tx }));
vi.mock('mysql2/promise', () => ({ default: { createConnection: isolation.denied, createPool: isolation.denied },
  createConnection: isolation.denied, createPool: isolation.denied }));
vi.mock('mysql2', () => ({ default: { createConnection: isolation.denied, createPool: isolation.denied },
  createConnection: isolation.denied, createPool: isolation.denied }));
vi.mock('node:http', () => ({ default: { request: isolation.denied, get: isolation.denied }, request: isolation.denied, get: isolation.denied }));
vi.mock('node:https', () => ({ default: { request: isolation.denied, get: isolation.denied }, request: isolation.denied, get: isolation.denied }));
vi.mock('node:net', () => ({ default: { connect: isolation.denied, createConnection: isolation.denied }, connect: isolation.denied, createConnection: isolation.denied }));
vi.mock('node:tls', () => ({ default: { connect: isolation.denied }, connect: isolation.denied }));
import { getForcedLiquidationSettingDetail } from './forced-liquidation-setting-detail';
import { calculateOrdinaryTagDownsideSeries } from '../shared/ordinary-tag-downside';
// Project vitest include is server-only. This focused entry executes our shared pure suite
// without modifying config, running other suites, or connecting any real database.
import '../shared/forced-liquidation-display.test';

const input = { ledgerId: 37, userId: 7, categoryId: 81, lotId: 101 };
const category = (overrides: Record<string, unknown> = {}) => ({ id: 81, ledgerId: 37, parentId: null,
  isDefault: 0, accounting_mode: 'stock_portfolio', name: '真实标签', ...overrides });
const lot = (overrides: Record<string, unknown> = {}) => ({ id: 101, ledger_id: 37, category_id: 81, symbol: 'AAPL',
  unit_cost: '100', initial_quantity: '20', allocated_quantity: '10', opening_status: 'active', opening_event_type: 'buy',
  actual_traded_at: '2026-11-20 09:35:16', ...overrides });
const rule = (overrides: Record<string, unknown> = {}) => ({ ledger_id: 37, category_id: 81, lot_id: 101, user_id: 7,
  version: 2, enabled: 1, threshold_price: '80', downside_percent: '20', start_date: '2026-11-20',
  effective_at: '2026-11-19T16:00:00.000000Z', baseline_raw_price: '80', baseline_counted_price: '80',
  baseline_source: 'owner_threshold', baseline_status: 'ready', holding_start_at: '2026-11-20T09:35:16+08:00', currency: 'USD', ...overrides });
const quote = (overrides: Record<string, unknown> = {}) => ({ id: 1, ledger_id: 37, category_id: 81, symbol: 'AAPL',
  price: '60', price_date: '2026-11-25', captured_at: '2026-11-25 15:05:00.000000', ...overrides });
const ordinaryRule = (overrides: Record<string, unknown> = {}) => ({ ledger_id: 37, category_id: 81, user_id: 7, version: 2,
  enabled: 1, threshold_amount: '80', downside_percent: '20', start_date: '2026-11-20',
  created_at: '2026-11-25T06:00:00.000000Z', ...overrides });
const record = (id: number, day: string, value: unknown, overrides: Record<string, unknown> = {}) => ({
  id, ledgerId: 37, categoryId: 81, recordDate: day, type: 'income', amount: value,
  createdAt: `${day} 12:00:00.000000`, deletedAt: null, description: null, ...overrides });
const autoColumns = ['activation_mode', 'auto_drop_percent', 'auto_entry_price', 'armed_at', 'triggered_at',
  'trigger_price', 'trigger_quote_as_of', 'trigger_source'];
const dateColumns = ['start_date', 'baseline_status', 'baseline_source', 'holding_start_at'];
const utcColumns = ['effective_at', 'armed_at', 'triggered_at', 'trigger_quote_as_of'];
const badColumn = (name: string, errnoOnly = false) => Object.assign(new Error(`Unknown column '${name}' in 'field list'`),
  errnoOnly ? { errno: 1054 } : { code: 'ER_BAD_FIELD_ERROR', sqlMessage: `Unknown column '${name}' in 'field list'` });
// mysql2 interpreting a UTC DATETIME wall value in a local +08 zone produces a different Date
// instant. Only SQL formatting must recover the stored wall value, never Date.toISOString().
const mysqlDate = (wall: string) => Object.assign(new Date(`${wall.replace(' ', 'T')}+08:00`), { mysqlUtcWall: wall });
const automaticRule = (overrides: Record<string, unknown> = {}) => rule({ version: 3, activation_mode: 'auto_drop',
  threshold_price: '90', downside_percent: '0', auto_drop_percent: '10', auto_entry_price: '100',
  baseline_raw_price: '90', baseline_counted_price: '90', start_date: '2026-11-26',
  effective_at: '2026-11-25T16:00:13.123Z', armed_at: '2026-11-25T16:00:13.123Z',
  triggered_at: null, trigger_price: null, trigger_quote_as_of: null, trigger_source: null, ...overrides });
function fixture(ordinary = false) {
  const state = { owner: 7 as number | null, categories: [category(ordinary ? { accounting_mode: 'manual_balance' } : {})] as any[],
    lots: [lot()] as any[], stockRules: [rule()] as any[], ordinaryRules: [ordinaryRule()] as any[],
    close: [quote()] as any[], intraday: [] as any[], config: [{ ledger_id: 37, tag_name: '真实标签', initial_amount: '100' }] as any[],
    records: [record(1, '2026-11-20', '100'), record(2, '2026-11-25', '60')] as any[],
    missing: new Set<string>(), failures: new Map<string, any>(), oldStockColumns: false,
    missingStockColumns: new Set<string>(), errnoOnly: false, unknownStockColumnError: false };
  const conn = { execute: vi.fn(async (sql: string, values: any[]) => {
    if (!/^SELECT\b/.test(sql) || /\bFOR UPDATE\b/i.test(sql)) throw new Error('forbidden non-SELECT');
    const table = sql.match(/\bFROM\s+(\w+)/)?.[1];
    if (table && state.failures.has(table)) throw state.failures.get(table);
    if (table && state.missing.has(table)) throw Object.assign(new Error('missing table'), { errno: 1146 });
    if (table === 'ledgers') return [state.owner === null ? [] : [{ ownerId: state.owner }]];
    if (table === 'ledger_categories') return [state.categories];
    if (table === 'ledger_stock_lots') return [state.lots];
    if (table === 'ledger_stock_price_snapshots') return [state.close];
    if (table === 'ledger_stock_intraday_quotes') return [state.intraday];
    if (table === 'ledger_stock_lot_downside_rules') {
      const select = sql.split(/\bFROM\b/)[0];
      const absent = new Set([...Array.from(state.missingStockColumns), ...(state.oldStockColumns ? [...dateColumns, ...autoColumns] : [])]);
      const missing = select.match(/\b[a-z_]+\b/g)?.find(name => absent.has(name));
      if (missing) throw badColumn(missing, state.errnoOnly);
      if (state.unknownStockColumnError && select.includes('auto_drop_percent')) throw Object.assign(new Error('unspecified bad field'), { errno: 1054 });
      const latest = [...state.stockRules].sort((a, b) => b.version - a.version)[0];
      if (!latest) return [[]];
      const projected = Object.fromEntries(Object.entries(latest).filter(([name]) => !absent.has(name) && new RegExp(`\\b${name}\\b`).test(select)));
      for (const name of utcColumns) {
        const value = projected[name] as any;
        if (!(value instanceof Date) || !value.mysqlUtcWall) continue;
        if (select.includes(`CONCAT(LEFT(DATE_FORMAT(${name},'%Y-%m-%dT%H:%i:%s.%f'),23),'Z') AS ${name}`)) {
          projected[name] = `${value.mysqlUtcWall.replace(' ', 'T')}Z`;
        } else if (select.includes(`DATE_FORMAT(${name},'%Y-%m-%dT%H:%i:%s.%fZ') AS ${name}`)) {
          projected[name] = `${value.mysqlUtcWall.replace(' ', 'T')}000Z`;
        }
      }
      return [[projected]];
    }
    if (table === 'ledger_ordinary_tag_downside_rules') return [state.ordinaryRules];
    if (table === 'ledger_tag_config') return [state.config];
    if (table === 'ledger_records') return [state.records];
    throw new Error(`Unexpected SQL ${sql} ${JSON.stringify(values)}`);
  }) };
  db.get.mockResolvedValue(conn);
  return { state, conn };
}
const ordinaryInput = { ledgerId: 37, userId: 7, categoryId: 81 };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', isolation.denied);
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-26T01:00:00Z')); });
afterEach(() => { expect(isolation.denied).not.toHaveBeenCalled(); vi.mocked(Date.now).mockRestore(); vi.unstubAllGlobals(); });
describe('detail owner-only scope and SELECT-only isolation', () => {
  it.each([{ ...input, isViewingAs: true }, { ...input, ledgerId: 52 }, { ...input, userId: 0 },
    { ...input, categoryId: 81.5 }, { ...input, lotId: -1 }])('bad input zero DB %o', async request => {
    fixture(); await expect(getForcedLiquidationSettingDetail(request)).rejects.toThrow(); expect(db.get).not.toHaveBeenCalled();
  });
  it.each(['admin', 'super_admin', 'owner', undefined])('systemRole=%s cannot replace actual ownership', async systemRole => {
    const { state, conn } = fixture(); state.owner = 8;
    await expect(getForcedLiquidationSettingDetail({ ...input, systemRole })).rejects.toThrow('实际所有者');
    expect(conn.execute.mock.calls).toEqual([['SELECT ownerId FROM ledgers WHERE id=? LIMIT 1', [37]]]); expect(db.tx).not.toHaveBeenCalled();
  });
  it('missing owner and missing connection fail without data reads', async () => {
    const { state, conn } = fixture(); state.owner = null;
    await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow('实际所有者'); expect(conn.execute).toHaveBeenCalledTimes(1);
    db.get.mockResolvedValue(null); await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow('数据库连接');
  });
  it.each([{ ledgerId: 52 }, { id: 82 }, { parentId: 10 }, { isDefault: 1 }, { accounting_mode: 'other' }, { name: '' }])('category exact %o', async overrides => {
    const { state, conn } = fixture(); state.categories = [category(overrides)];
    await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow('顶级标签'); expect(conn.execute).toHaveBeenCalledTimes(2);
  });
  it.each([{ ledger_id: 52 }, { category_id: 82 }, { id: 102 }, { opening_status: 'void' }, { opening_event_type: 'sell' }])('lot exact %o', async overrides => {
    const { state, conn } = fixture(); state.lots = [lot(overrides)];
    await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow('持仓'); expect(conn.execute).toHaveBeenCalledTimes(3);
  });
  it('stock requires lot, ordinary rejects lot before details', async () => {
    let f = fixture(); await expect(getForcedLiquidationSettingDetail(ordinaryInput)).rejects.toThrow('lotId'); expect(f.conn.execute).toHaveBeenCalledTimes(2);
    f = fixture(true); await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow('普通标签'); expect(f.conn.execute).toHaveBeenCalledTimes(2);
  });
  it('service does not import/execute portfolio, routers, member/wallet or first page', async () => {
    const { conn } = fixture(); await getForcedLiquidationSettingDetail(input);
    expect(conn.execute.mock.calls[0]?.[0]).toContain('FROM ledgers');
    expect(conn.execute.mock.calls[1]?.[1]).toEqual([37, 81]);
    expect(conn.execute.mock.calls[2]?.[1].slice(1)).toEqual([37, 81, 101]);
    expect(conn.execute.mock.calls.every(([sql]) => /^SELECT\b/.test(sql))).toBe(true); expect(db.tx).not.toHaveBeenCalled();
    const source = readFileSync(new URL('./forced-liquidation-setting-detail.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*(?:ledger-stock-portfolio|routers|forced-liquidation-settings)['"]/);
    expect(source).not.toMatch(/\b(?:ledger_members|balance_history|beginTransaction|setInterval|setTimeout|fetch)\b/);
    for (const [sql] of conn.execute.mock.calls) expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|FOR UPDATE)\b/);
  });
});
describe('stock source-native detail', () => {
  it('real opening unit_cost, real sold allocation, shared USD, no cashflow, independent price SELECTs', async () => {
    const { conn } = fixture(); const result = await getForcedLiquidationSettingDetail(input);
    expect(result).toMatchObject({ ledgerId: 37, categoryId: 81, lotId: 101, kind: 'stock', currency: 'USD', initialValue: 100,
      latestValue: 60, latestDate: '2026-11-25', latestSource: 'ledger_stock_price_snapshots:close', remainingQuantity: 10,
      effectiveFunds: 240, ineffectiveFunds: 160, capitalChange: 0, withdraw: 0, status: 'ready', fundBasis: 'segmented_price_drop' });
    expect(result.rule).toMatchObject({ version: 2, threshold: 80, downsidePercent: 20, baselineSource: 'owner_threshold' });
    for (const [sql, values] of conn.execute.mock.calls.filter(([sql]) => /FROM ledger_stock_(?:price_snapshots|intraday_quotes)/.test(sql))) {
      expect(sql).toMatch(/ledger_id=\? AND category_id=\? AND symbol=\?/); expect(values.slice(0, 3)).toEqual([37, 81, 'AAPL']);
    }
  });
  it.each([['600000.SH', 'CNY'], ['AAPL', 'USD'], ['CRYPTO:ETH-USDT', 'USDT']])('shared portfolio currency %s => %s', async (symbol, currency) => {
    const { state } = fixture(); state.lots = [lot({ symbol })]; state.close = [quote({ symbol })]; state.stockRules = [rule({ currency })];
    expect((await getForcedLiquidationSettingDetail(input)).currency).toBe(currency);
  });
  it('crypto fractional remaining follows source precision and does not invent member quantities', async () => {
    const { state } = fixture(); const symbol = 'CRYPTO:ETH-USDT';
    state.lots = [lot({ symbol, initial_quantity: '0.3', allocated_quantity: '0.1' })];
    state.close = [quote({ symbol })]; state.stockRules = [rule({ currency: 'USDT' })];
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ currency: 'USDT', remainingQuantity: 0.2, status: 'ready' });
  });
  it('quote captured before the actual opening cannot substitute for latest holding evidence', async () => {
    const { state } = fixture(); state.close = [quote({ price_date: '2026-11-19', captured_at: '2026-11-19 15:05:00.000000' })];
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ status: 'pending', effectiveFunds: null, latestDate: '2026-11-19' });
  });
  it('US priceDate is New York session date, not a Beijing midnight rule activation filter', async () => {
    const { state } = fixture(); state.lots = [lot({ actual_traded_at: '2026-11-26 00:05:00' })];
    state.intraday = [quote({ captured_at: '2026-11-26 00:10:00.000000', price_date: '2026-11-25' })];
    state.stockRules = [rule({ start_date: '2026-11-26', effective_at: '2026-11-25T16:00:00.000000Z' })];
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ status: 'ready', latestDate: '2026-11-25', effectiveFunds: 240 });
  });
  it('latest date first, captured microseconds second, intraday source exact tie; ignore foreign/future', async () => {
    const { state } = fixture(); state.close = [quote({ price: '62' }), quote({ price: '99', price_date: '2026-11-24', captured_at: '2026-11-25 20:00:00.000000' })];
    state.intraday = [quote({ price: '58' }), quote({ price: '1', ledger_id: 52 }), quote({ price: '2', category_id: 82 }),
      quote({ price: '3', symbol: 'MSFT' }), quote({ price: '4', price_date: '2099-01-01' }), quote({ price: '5', captured_at: '2099-01-01 00:00:00' })];
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ latestValue: 58, latestSource: 'ledger_stock_intraday_quotes:intraday' });
  });
  it('latest invalid quote stays pending instead of old valid', async () => {
    const { state } = fixture(); state.intraday = [quote({ price: 'bad', captured_at: '2026-11-25 15:06:00' })];
    const result = await getForcedLiquidationSettingDetail(input); expect(result.latestValue).toBeNull(); expect(result.effectiveFunds).toBeNull(); expect(result.notice).toContain('不回退');
  });
  it('absent quote/missing tables stays no_data and no synthetic opening quote', async () => {
    const { state } = fixture(); state.missing.add('ledger_stock_price_snapshots'); state.missing.add('ledger_stock_intraday_quotes');
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ status: 'no_data', latestValue: null, latestDate: null, effectiveFunds: null });
  });
  it.each([{ price: '0' }, { price: null }, { price: '1e309' }, { price_date: '2026-02-30' }])('bad quote %o never zero money', async overrides => {
    const { state } = fixture(); state.close = [quote(overrides)]; const r = await getForcedLiquidationSettingDetail(input); expect(r.effectiveFunds).toBeNull();
  });
  it.each([{ unit_cost: null }, { initial_quantity: null }, { allocated_quantity: null }, { allocated_quantity: 21 },
    { actual_traded_at: null }, { actual_traded_at: '2099-11-20 09:35:16' }, { unit_cost: '1e308', initial_quantity: '1e308', allocated_quantity: 0 }])('missing opening/quantity/overflow %o', async overrides => {
    const { state } = fixture(); state.lots = [lot(overrides)]; expect((await getForcedLiquidationSettingDetail(input)).effectiveFunds).toBeNull();
  });
  it.each([{ baseline_source: 'opening' }, { baseline_source: 'verified_close' }, { baseline_source: 'legacy' },
    { baseline_status: 'pending' }, { baseline_raw_price: null }, { baseline_raw_price: '79' }, { baseline_counted_price: '79' }])('historical baseline %o does not block current segmented display or change stored rules', async overrides => {
    const { state, conn } = fixture(); state.stockRules = [rule({ version: 3, ...overrides })];
    const original = JSON.stringify(state.stockRules);
    const r = await getForcedLiquidationSettingDetail(input);
    expect(r).toMatchObject({ status: 'ready', effectiveFunds: 240, ineffectiveFunds: 160 });
    expect(r.rule?.version).toBe(3); expect(r).not.toHaveProperty('countedPnl');
    expect(r.notice).toContain('不是钱包余额或历史累计实得收益');
    if ('baseline_source' in overrides) expect(r.notice).toContain('旧规则的历史日结和客户收益仍沿用原算法');
    expect(JSON.stringify(state.stockRules)).toBe(original);
    expect(conn.execute.mock.calls.every(([sql]) => /^SELECT\b/.test(sql))).toBe(true);
    expect(db.tx).not.toHaveBeenCalled();
  });
  it.each([{ threshold_price: 0 }, { downside_percent: 101 }, { downside_percent: -1 }, { enabled: 2 },
    { effective_at: 'bad' }, { start_date: '2099-01-01', effective_at: '2098-12-31T16:00:00.000Z' }, { currency: 'CNY' }])('latest rule invalid/future %o no fallback', async overrides => {
    const { state } = fixture(); state.stockRules = [rule({ version: 1 }), rule({ version: 3, ...overrides })];
    const r = await getForcedLiquidationSettingDetail(input); expect(r.status).toBe('pending'); expect(r.effectiveFunds).toBeNull(); expect(r.rule?.version).toBe(3); expect(r.notice).toBeTruthy();
  });
  it('missing rule and old schema never upgrade automatically', async () => {
    const { state } = fixture(); state.stockRules = []; expect((await getForcedLiquidationSettingDetail(input)).effectiveFunds).toBeNull();
    state.stockRules = [rule()]; state.oldStockColumns = true; expect((await getForcedLiquidationSettingDetail(input)).notice).toContain('旧规则');
  });
  it.each([[0, 200, 200], [100, 400, 0]])('0/100%% service r=%s', async (percent, effective, ineffective) => {
    const { state } = fixture(); state.stockRules = [rule({ downside_percent: percent })];
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ status: 'ready', effectiveFunds: effective, ineffectiveFunds: ineffective });
  });
  it('K>I and initial below K clip actual observed decline only; rebound zero; disabled full', async () => {
    const { state } = fixture(); state.stockRules = [rule({ threshold_price: 120, baseline_raw_price: 120, baseline_counted_price: 120 })];
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ effectiveFunds: 80, ineffectiveFunds: 320 });
    state.close = [quote({ price: 110 })]; expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ effectiveFunds: 0, ineffectiveFunds: 0 });
    state.close = [quote()]; state.stockRules = [rule({ enabled: 0 })]; expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ effectiveFunds: 400, ineffectiveFunds: 0 });
  });
  it('DB errors propagate without compatibility raw fallback', async () => {
    const { state } = fixture(); state.failures.set('ledger_stock_price_snapshots', new Error('network failure'));
    await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow('network failure');
  });
});
describe('stock automatic detail SQL time and schema fail-closed regressions', () => {
  const ruleQueries = (conn: ReturnType<typeof fixture>['conn']) => conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_stock_lot_downside_rules'));
  it('actual driver Date values become exact UTC millisecond strings through SQL, not local Date conversion', async () => {
    const { state, conn } = fixture();
    const armed = mysqlDate('2026-11-25 16:00:13.123');
    const triggered = mysqlDate('2026-11-25 16:01:17.456');
    const observed = mysqlDate('2026-11-25 16:01:16.789');
    state.stockRules = [automaticRule({ effective_at: triggered, armed_at: armed, triggered_at: triggered,
      trigger_price: '60', trigger_quote_as_of: observed, trigger_source: 'actual-intraday' })];
    state.intraday = [quote({ captured_at: '2026-11-26 00:02:00.000000' })];
    const result = await getForcedLiquidationSettingDetail(input);
    expect(result.status).toBe('ready'); expect(result.ineffectiveFunds).toBeGreaterThan(0);
    expect(result.rule).toMatchObject({ activationMode: 'auto_drop', armedAt: '2026-11-25T16:00:13.123Z',
      triggeredAt: '2026-11-25T16:01:17.456Z', triggerQuoteAsOf: '2026-11-25T16:01:16.789Z', triggerSource: 'actual-intraday' });
    expect(observed).toBeInstanceOf(Date); expect(observed.toISOString()).not.toBe(result.rule?.triggerQuoteAsOf);
    expect(state.stockRules[0].trigger_quote_as_of).toBe(observed); // no input/audit repair
    const queries = ruleQueries(conn); expect(queries).toHaveLength(1);
    for (const name of utcColumns) expect(queries[0][0]).toContain(`CONCAT(LEFT(DATE_FORMAT(${name},'%Y-%m-%dT%H:%i:%s.%f'),23),'Z') AS ${name}`);
    expect(queries[0][0]).not.toMatch(/CONVERT_TZ|\+08:00/);
    expect(queries[0][1]).toEqual([37, 81, 101]); expect(conn.execute.mock.calls[0][0]).toBe('SELECT ownerId FROM ledgers WHERE id=? LIMIT 1');
  });
  it('Beijing midnight waiting retains exact save instant and older NY quote, never activates on read', async () => {
    const { state, conn } = fixture(); vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-25T16:00:30Z'));
    const armed = mysqlDate('2026-11-25 16:00:13.123');
    state.stockRules = [rule({ version: 2 }), automaticRule({ effective_at: armed, armed_at: armed })];
    state.intraday = [quote({ captured_at: '2026-11-26 00:00:10.000000' })];
    const result = await getForcedLiquidationSettingDetail(input);
    expect(result).toMatchObject({ status: 'ready', latestDate: '2026-11-25', effectiveFunds: 400, ineffectiveFunds: 0 });
    expect(result.rule).toMatchObject({ version: 3, startDate: '2026-11-26', activationMode: 'auto_drop', armedAt: '2026-11-25T16:00:13.123Z' });
    expect(result.rule?.triggeredAt).toBeUndefined(); expect(result.notice).toContain('页面读取不会触发');
    expect(state.stockRules[1].triggered_at).toBeNull(); expect(ruleQueries(conn)).toHaveLength(1);
    expect(db.tx).not.toHaveBeenCalled();
  });
  it.each([false, true])('real preceding manual/date schema missing activation_mode remains ready (errnoOnly=%s)', async errnoOnly => {
    const { state, conn } = fixture(); state.errnoOnly = errnoOnly;
    autoColumns.forEach(name => state.missingStockColumns.add(name));
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ status: 'ready', effectiveFunds: 240, ineffectiveFunds: 160 });
    const queries = ruleQueries(conn); expect(queries).toHaveLength(2);
    expect(queries[0][0]).toContain('activation_mode'); expect(queries[1][0]).toContain('start_date');
    expect(queries[1][0]).not.toContain('activation_mode');
    for (const [, values] of queries) expect(values).toEqual([37, 81, 101]);
  });
  it('true oldest schema reporting start_date first confirms missing mode by SELECT and preserves legacy pending', async () => {
    const { state, conn } = fixture(); state.oldStockColumns = true;
    const result = await getForcedLiquidationSettingDetail(input);
    expect(result).toMatchObject({ status: 'pending', effectiveFunds: null, ineffectiveFunds: null }); expect(result.notice).toContain('旧规则');
    const queries = ruleQueries(conn); expect(queries).toHaveLength(4);
    expect(queries[1][0]).toMatch(/^SELECT activation_mode FROM/);
    expect(queries[3][0]).not.toMatch(/start_date|activation_mode/);
  });
  it.each(['auto_drop_percent', 'auto_entry_price', 'armed_at', 'triggered_at', 'trigger_price', 'trigger_quote_as_of', 'trigger_source',
    'start_date', 'baseline_status', 'baseline_source', 'holding_start_at'])('partial auto schema missing %s cannot become manual/ready, including midnight waiting', async name => {
    const { state, conn } = fixture(); vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-25T16:00:30Z'));
    state.stockRules = [rule({ version: 2 }), automaticRule()];
    state.intraday = [quote({ captured_at: '2026-11-26 00:00:10.000000' })];
    state.missingStockColumns.add(name);
    const original = JSON.stringify(state.stockRules);
    await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow(`Unknown column '${name}'`);
    const queries = ruleQueries(conn); expect(queries).toHaveLength(2);
    expect(queries[1][0]).toMatch(/^SELECT activation_mode FROM/);
    expect(queries.every(([sql]) => sql.includes('activation_mode'))).toBe(true);
    expect(JSON.stringify(state.stockRules)).toBe(original); expect(db.tx).not.toHaveBeenCalled();
  });
  it('unknown missing-column error with existing activation_mode cannot use a legacy projection', async () => {
    const { state, conn } = fixture(); state.unknownStockColumnError = true; state.stockRules = [automaticRule()];
    await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow('unspecified bad field');
    expect(ruleQueries(conn)).toHaveLength(2); expect(ruleQueries(conn)[1][0]).toMatch(/^SELECT activation_mode FROM/);
  });
  it('unidentifiable activation-mode probe failure also fails closed without legacy reads', async () => {
    const { state, conn } = fixture(); state.failures.set('ledger_stock_lot_downside_rules', Object.assign(new Error('unknown schema'), { errno: 1054 }));
    await expect(getForcedLiquidationSettingDetail(input)).rejects.toThrow('unknown schema');
    expect(ruleQueries(conn)).toHaveLength(2);
  });
  it.each([{ trigger_quote_as_of: null }, { trigger_source: '' }, { armed_at: null }])('present auto columns with damaged audit %o keep pending without inventing evidence', async overrides => {
    const { state, conn } = fixture();
    state.stockRules = [rule({ version: 2 }), automaticRule({ effective_at: '2026-11-25T16:01:17.456Z',
      triggered_at: '2026-11-25T16:01:17.456Z', trigger_price: '60', trigger_quote_as_of: '2026-11-25T16:01:16.789Z',
      trigger_source: 'actual-intraday', ...overrides })];
    const original = JSON.stringify(state.stockRules);
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ status: 'pending', effectiveFunds: null, ineffectiveFunds: null,
      rule: { version: 3, activationMode: 'auto_drop' } });
    expect(ruleQueries(conn)).toHaveLength(1); expect(JSON.stringify(state.stockRules)).toBe(original);
  });
  it('missing rules table never enables or creates a rule', async () => {
    const { state, conn } = fixture(); state.stockRules = [automaticRule()]; state.missing.add('ledger_stock_lot_downside_rules');
    expect(await getForcedLiquidationSettingDetail(input)).toMatchObject({ status: 'pending', rule: null, effectiveFunds: null, ineffectiveFunds: null });
    expect(ruleQueries(conn)).toHaveLength(1); expect(db.tx).not.toHaveBeenCalled();
    for (const [sql] of conn.execute.mock.calls) expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|FOR UPDATE)\b/);
  });
});
describe('ordinary global initial canonical full-history neutral replay', () => {
  it('global initial only and canonical nontransfer latest; parameter name avoids collation JOIN', async () => {
    const { state, conn } = fixture(true); state.records.push(record(3, '2026-11-25', 999, { type: 'transfer', description: 'capital_add' }));
    const r = await getForcedLiquidationSettingDetail(ordinaryInput);
    expect(r.latestValue).toBe(60); expect(r.latestSource).toBe('ledger_records:2'); expect(r.initialValue).toBe(100);
    expect(r.notice).toContain('两端');
    const configQuery = conn.execute.mock.calls.find(([sql]) => sql.includes('FROM ledger_tag_config'))!;
    expect(configQuery[1]).toEqual([37, '真实标签']); expect(configQuery[0]).not.toContain('JOIN');
    const recQuery = conn.execute.mock.calls.find(([sql]) => sql.includes('FROM ledger_records'))!;
    expect(recQuery[0]).toContain('(c.id=? OR c.parentId=?)'); expect(recQuery[1]).toEqual([37, 81, 81, '2026-11-26']);
  });
  it('no cashflow exactly matches existing replay, not wallet or counted balance', async () => {
    fixture(true); expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ kind: 'ordinary', lotId: null,
      currency: 'CNY', initialValue: 100, latestValue: 60, latestDate: '2026-11-25', status: 'ready',
      rawPnl: 40, countedPnl: 24, effectiveFunds: 24, ineffectiveFunds: 16, capitalChange: 0, withdraw: 0, fundBasis: 'cashflow_neutral_replay' });
  });
  it.each([['capital_add', 100, 200, 100, 0], ['capital_remove', 20, 80, -20, 0], ['withdraw', 20, 80, 0, 20]])(
    'pure %s zero profit not I-B', async (description, flow, latest, capitalChange, withdraw) => {
      const { state } = fixture(true); state.records = [record(1, '2026-11-20', 100), record(2, '2026-11-21', flow, { type: 'transfer', description }), record(3, '2026-11-25', latest)];
      expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ rawPnl: 0, countedPnl: 0, effectiveFunds: 0,
        ineffectiveFunds: 0, capitalChange, withdraw, status: 'ready' });
    });
  it('full history transfer-only days/threshold crossings use shared engine and all rules exactly', async () => {
    const { state } = fixture(true);
    state.ordinaryRules = [ordinaryRule({ version: 1, start_date: '2026-11-20', downside_percent: 50 }), ordinaryRule({ version: 2, start_date: '2026-11-24', downside_percent: 20 })];
    state.records = [record(1, '2026-11-20', 100), record(2, '2026-11-21', 60),
      record(3, '2026-11-22', 40, { type: 'transfer', description: 'capital_add' }), record(4, '2026-11-23', 90),
      record(5, '2026-11-24', 10, { type: 'transfer', description: 'capital_remove' }), record(6, '2026-11-25', 60)];
    const pure = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId: 81, initialAmount: 100, entryDate: '2026-11-20', ratio: 100,
      rules: state.ordinaryRules.map(s => ({ ledgerId: 37, categoryId: 81, userId: 7, version: s.version, enabled: true,
        thresholdAmount: 80, downsidePercent: Number(s.downside_percent), startDate: s.start_date, createdAt: s.created_at })),
      points: [{ date: '2026-11-20', rawBalance: 100, capitalChange: 0, withdraw: 0 }, { date: '2026-11-21', rawBalance: 60, capitalChange: 0, withdraw: 0 },
        { date: '2026-11-22', rawBalance: null, capitalChange: 40, withdraw: 0 }, { date: '2026-11-23', rawBalance: 90, capitalChange: 0, withdraw: 0 },
        { date: '2026-11-24', rawBalance: null, capitalChange: -10, withdraw: 0 }, { date: '2026-11-25', rawBalance: 60, capitalChange: 0, withdraw: 0 }] }).at(-1)!;
    const r = await getForcedLiquidationSettingDetail(ordinaryInput);
    expect(r.rawPnl).toBe(pure.rawPnl); expect(r.effectiveFunds).toBe(pure.countedPnl);
    expect(r.ineffectiveFunds).toBe(pure.rawPnl! - pure.countedPnl!); expect(r.capitalChange).toBe(30); expect(r.notice).toContain('不是初始与最新两端');
  });
  it('createdAt microseconds then id canonical last wins; exclude future/deleted/foreign; invalid latest cannot revive old', async () => {
    const { state } = fixture(true); state.records.push(record(10, '2026-11-25', 61, { createdAt: '2026-11-25 12:00:00.000001' }),
      record(11, '2026-11-25', 62, { createdAt: '2026-11-25 12:00:00.000001' }), record(20, '2099-11-25', 999),
      record(21, '2026-11-26', 999, { deletedAt: '2026-11-26 00:00:00' }), record(22, '2026-11-26', 999, { ledgerId: 52 }),
      record(23, '2026-11-26', 999, { categoryId: 82 }));
    expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ latestValue: 62, latestSource: 'ledger_records:11' });
    state.records.push(record(12, '2026-11-25', null, { createdAt: '2026-11-25 12:00:00.000001' }));
    expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ latestValue: null, latestSource: 'ledger_records:12', status: 'pending', effectiveFunds: null });
  });
  it.each([null, '', 'bad', '-1', '1e309'])('missing global initial %s pending; member/global account values never substitute', async initial => {
    const { state } = fixture(true); state.config[0] = { ...state.config[0], initial_amount: initial, account_balance: 100, original_amount: 100, balance_date: '2026-11-20' };
    const r = await getForcedLiquidationSettingDetail(ordinaryInput); expect(r.initialValue).toBeNull(); expect(r.latestValue).toBe(60); expect(r.effectiveFunds).toBeNull(); expect(r.notice).toContain('不使用任何成员本金');
  });
  it('first canonical not global initial / earlier flow / net zero flow => no fabricated entry evidence', async () => {
    const { state } = fixture(true); state.records[0].amount = 99; expect((await getForcedLiquidationSettingDetail(ordinaryInput)).notice).toContain('起始余额证据');
    state.records[0].amount = 100; state.records.push(record(10, '2026-11-19', 10, { type: 'transfer', description: 'capital_add' }), record(11, '2026-11-19', 10, { type: 'transfer', description: 'capital_remove' }));
    expect((await getForcedLiquidationSettingDetail(ordinaryInput)).effectiveFunds).toBeNull();
  });
  it('no balance/transfer-only latest and missing config do not generate values', async () => {
    const { state } = fixture(true); state.records = [record(2, '2026-11-25', 10, { type: 'transfer', description: 'capital_add' })];
    expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ status: 'no_data', latestValue: null, latestDate: null, effectiveFunds: null });
    state.records = [record(1, '2026-11-20', 100), record(2, '2026-11-25', 60)]; state.missing.add('ledger_tag_config');
    expect((await getForcedLiquidationSettingDetail(ordinaryInput)).initialValue).toBeNull();
  });
  it('pending invalid/encrypted transfer and cumulative overflow stay null', async () => {
    const { state } = fixture(true); state.records.push(record(3, '2026-11-22', 'bad', { type: 'transfer', description: 'capital_add' }));
    expect((await getForcedLiquidationSettingDetail(ordinaryInput)).effectiveFunds).toBeNull();
    state.records[2] = record(3, '2026-11-22', 10, { type: 'transfer', description: 'enc:v1:unreadable' });
    expect((await getForcedLiquidationSettingDetail(ordinaryInput)).effectiveFunds).toBeNull();
    state.records[2] = record(3, '2026-11-22', '1e308', { type: 'transfer', description: 'capital_add' });
    state.records.push(record(4, '2026-11-23', '1e308', { type: 'transfer', description: 'capital_add' }));
    expect((await getForcedLiquidationSettingDetail(ordinaryInput)).effectiveFunds).toBeNull();
  });
  it('highest future saved revision keeps detail pending instead of old replay fallback', async () => {
    const { state } = fixture(true); state.ordinaryRules.push(ordinaryRule({ version: 3, start_date: '2099-01-01' }));
    const r = await getForcedLiquidationSettingDetail(ordinaryInput); expect(r.rule?.version).toBe(3); expect(r.effectiveFunds).toBeNull(); expect(r.notice).toContain('不自动回退');
  });
  it.each([[0, 20, 20], [100, 40, 0]])('ordinary r=%s 0/100 via actual replay', async (percent, counted, ineffective) => {
    const { state } = fixture(true); state.ordinaryRules = [ordinaryRule({ downside_percent: percent })];
    expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ effectiveFunds: counted, ineffectiveFunds: ineffective });
  });
  it('K>I fresh entry offset, rebound signed and disabled actual raw', async () => {
    const { state } = fixture(true); state.ordinaryRules = [ordinaryRule({ threshold_amount: 120 })];
    expect((await getForcedLiquidationSettingDetail(ordinaryInput)).effectiveFunds).toBeCloseTo(8, 9);
    state.records[1].amount = 110;
    expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ rawPnl: -10, effectiveFunds: -2, ineffectiveFunds: -8 });
    state.ordinaryRules = [ordinaryRule({ enabled: 0 })];
    expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ effectiveFunds: -10, ineffectiveFunds: 0 });
  });
  it('true zero initial and latest are valid (no percentage initial divisor)', async () => {
    const { state } = fixture(true); state.config[0].initial_amount = 0; state.records[0].amount = 0; state.records[1].amount = 0;
    expect(await getForcedLiquidationSettingDetail(ordinaryInput)).toMatchObject({ initialValue: 0, latestValue: 0, status: 'ready', effectiveFunds: 0, ineffectiveFunds: 0, initialToThresholdPercent: null });
  });
});
