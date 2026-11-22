import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { normalizePortfolioSymbol, portfolioCurrency } from '../shared/portfolio-instruments';
import { getOvernightUsSessionDate } from '../shared/stock-market-session';
import { isTrustedMemberCalendarClose } from './shared/stock-member-calendar';
import { isLedger37LiveHoldingQuoteValid, valueLedger37LiveHoldings, ledger37HoldingWeights,
  ledger37HoldingKey, ledger37HoldingAmount } from './shared/ledger37-holding-valuation';
import { USDT_USD_PARITY_POLICY } from '../shared/usdt-usd-parity-policy';

// Evaluate ONLY the new production read function, never import server DB/scanner.
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('portfolio.ts', source, ts.ScriptTarget.Latest, true);
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getMyLedger37R1HoldingSnapshot')!;
const body = declaration.getText(tree).replace(/^export /, '');
const liveBody = tree.statements.filter(node => ts.isFunctionDeclaration(node) && [
  'readLedger37LiveHoldingValuation', 'mergeLivePortfolioQuoteMaps', 'mergeLatestQuoteMaps',
].includes(node.name?.text ?? '')).map(node => node.getText(tree)).join('\n');
const compiled = ts.transpileModule(liveBody + '\n' + body + '\ngetMyLedger37R1HoldingSnapshot;', {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const input = { ledgerId: 37, userId: 201 };
const snapshotDate = '2026-11-10';
function lot(category_id = 1, symbol = '600000.SH', shares: unknown = '100', stock_name = '浦发银行') {
  return { category_id, symbol, shares, stock_name, allocatedQuantity: '0.01', unit_cost: '999', userId: 999, orderId: 321, project: '绝密项目' };
}
function proof(category_id = 1, symbol = '600000.SH', price = '10', patch: Record<string, unknown> = {}) {
  return { category_id, symbol, price, currency: portfolioCurrency(symbol), source: 'unified_close_yahoo',
    session_date: portfolioCurrency(symbol) === 'USD' ? '2026-11-09' : snapshotDate,
    captured_at: '2026-11-10 15:05:00', ...patch };
}
function fx(category_id = 2, patch: Record<string, unknown> = {}) {
  return { category_id, usd_cny_rate: '7', source: 'yahoo_usdcny_5m', quote_as_of: `${snapshotDate} 15:05:00`, locked_at: `${snapshotDate} 15:05:00`, ...patch };
}
function fixture() {
  const state = { canManage: false, member: true, aiEnabled: true, viewerUserId: 201, viewer: { userId: 201 } as any,
    ledgerId: 37, authError: null as any, lotError: null as any, quoteError: null as any, fxError: null as any, noConnection: false };
  const data = { lots: [lot()] as any[], quotes: [proof()] as any[], fx: [] as any[],
    liveStocks: {} as Record<string, any>, liveCrypto: {} as Record<string, any>, liveFx: null as any };
  const log: Array<{ sql: string; values: any[] }> = [];
  const conn = { execute: vi.fn(async (sql: string, values: any[]) => {
    log.push({ sql, values });
    if (!/^\s*SELECT\b/.test(sql) || /FOR UPDATE|GET_LOCK/i.test(sql)) throw new Error('只允许SELECT');
    if (/FROM \(\s*SELECT l.category_id/.test(sql)) {
      if (state.lotError) throw state.lotError;
      expect(values).toEqual([37]); return [data.lots];
    }
    if (/FROM ledger_stock_unified_close_prices/.test(sql)) {
      if (state.quoteError) throw state.quoteError;
      expect(values[0]).toBe(37); expect(values.slice(-2)).toEqual([snapshotDate, '2026-11-09']); return [data.quotes];
    }
    if (/FROM ledger_stock_unified_close_fx/.test(sql)) {
      if (state.fxError) throw state.fxError;
      expect(values[0]).toBe(37); expect(values.slice(-2)).toEqual([snapshotDate, 'cn-day-us-overnight-1505-v1']); return [data.fx];
    }
    throw new Error('未预期SQL');
  }) };
  const auth = vi.fn(async () => {
    if (state.authError) throw state.authError;
    return { isMember: state.member, context: { ledgerId: state.ledgerId, aiEnabled: state.aiEnabled,
      viewerUserId: state.viewerUserId, viewer: state.viewer, canManage: state.canManage } };
  });
  const db = vi.fn(async () => state.noConnection ? null : conn);
  const read = runInNewContext(compiled, { Error, Map, Set, BigInt, Number, JSON, Array, Date,
    isLedger37LiveHoldingQuoteValid, valueLedger37LiveHoldings, ledger37HoldingWeights,
    ledger37HoldingKey, ledger37HoldingAmount, USDT_USD_PARITY_POLICY,
    getLatestQuotes: vi.fn(async () => data.liveStocks), getLatestIntradayQuotes: vi.fn(async () => ({})),
    getLiveCryptoQuotes: vi.fn(async () => data.liveCrypto), getLiveStockUsdCnyQuote: vi.fn(async () => data.liveFx),
    isCryptoPortfolioSymbol: (symbol: string) => symbol.startsWith('CRYPTO:'),
    readLedger37PresentationState: auth, getDbConnection: db,
    normalizeSymbol: normalizePortfolioSymbol, stockCurrency: portfolioCurrency,
    getUnifiedStockCloseSnapshotDate: () => snapshotDate, getOvernightUsSessionDate,
    toBeijingWallClockIso: (value: unknown) => typeof value === 'string' ? value.replace(' ', 'T') + '+08:00' : '',
    isTrustedMemberCalendarClose, STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION: 'cn-day-us-overnight-1505-v1',
  }, { timeout: 1000 }) as (input: any) => Promise<any>;
  return { state, data, log, conn, auth, db, read };
}
function safe(result: any) {
  expect(JSON.stringify(result)).not.toMatch(/category|lotId|order|project|绝密|"userId"|allocated|entryPrice|unit_cost|price|quote|cost|marketValue|quantity|members|participation/i);
  for (const holding of result.holdings) expect(Object.keys(holding).sort()).toEqual(['currency', 'shares', 'stockName', 'symbol', 'weightPct']);
}
function unknown(result: any) {
  expect(result.holdings.every((row: any) => row.weightPct === null)).toBe(true);
  expect(result.valuationAsOf).toBeNull(); expect(result.reportingCurrency).toBeNull(); safe(result);
}

describe('R1 source-wide holdings: exact shares, read-only and fail closed', () => {
  it('merges current holdings across all projects, preserves suffixes and exact huge/fractional shares, omits closed', async () => {
    const f = fixture();
    f.data.lots = [lot(1, '600000.SH', '9007199254740993.00000001'), lot(2, '600000.SH', '0.00000009'),
      lot(2, '600000.SH', '3'), lot(3, 'MSFT', '0', '已结束'), lot(3, 'NVDA.O', '1.12345678', '英伟达')];
    f.data.quotes = [];
    const result = await f.read(input);
    expect(result.holdings).toEqual([
      { symbol: '600000.SH', stockName: '浦发银行', currency: 'CNY', shares: '9007199254740996.0000001', weightPct: null },
      { symbol: 'NVDA.O', stockName: '英伟达', currency: 'USD', shares: '1.12345678', weightPct: null },
    ]);
    unknown(result);
    expect(f.log[0].sql).toContain('CAST(SUM(current_lots.remaining_quantity) AS CHAR)');
    expect(f.log[0].sql).toContain("sale.status='active'");
    expect(f.log[0].sql).toContain("sale.event_type IN ('reduce','sell')");
    expect(f.log[0].sql).toContain('sale.ledger_id=l.ledger_id');
    expect(f.log[0].sql).toContain("opening.status='active'");
    expect(f.log[0].sql).not.toMatch(/participation|user_id|unit_cost|execution_price|note|visible/);
    expect(f.auth.mock.invocationCallOrder[0]).toBeLessThan(f.db.mock.invocationCallOrder[0]);
  });
  it('same-currency weights use market value, not share ratios or a default FX', async () => {
    const f = fixture(); f.data.lots = [lot(1, 'AAPL', '10', '同名'), lot(2, 'MSFT', '10', '同名')];
    f.data.quotes = [proof(1, 'AAPL', '20'), proof(2, 'MSFT', '10')];
    const result = await f.read(input);
    expect(result.reportingCurrency).toBe('USD'); expect(result.valuationAsOf).toBe(snapshotDate);
    expect(result.holdings[0].weightPct).toBeCloseTo(200 / 300 * 100);
    expect(result.holdings[1].weightPct).toBeCloseTo(100 / 300 * 100);
    expect(result.holdings.reduce((n: number, h: any) => n + h.weightPct, 0)).toBeCloseTo(100, 10);
    expect(f.log.some(row => /FROM ledger_stock_unified_close_fx/.test(row.sql))).toBe(false); safe(result);
  });
  it('cross-currency current quantity uses same snapshot close and actual archived FX in a single CNY denominator', async () => {
    const f = fixture(); f.data.lots = [lot(1), lot(2, 'AAPL', '10', '苹果'), lot(3, 'AAPL', '5', '苹果')];
    f.data.quotes = [proof(), proof(2, 'AAPL', '20'), proof(3, 'AAPL', '20')]; f.data.fx = [fx(2), fx(3)];
    const result = await f.read(input);
    expect(result.holdings).toHaveLength(2); expect(result.holdings[1].shares).toBe('15');
    expect(result.holdings[0].weightPct).toBeCloseTo(1000 / 3100 * 100);
    expect(result.holdings[1].weightPct).toBeCloseTo(2100 / 3100 * 100);
    expect(result.holdings.reduce((n: number, h: any) => n + h.weightPct, 0)).toBeCloseTo(100, 10);
    expect(result.reportingCurrency).toBe('CNY'); safe(result);
  });
  it.each([null, undefined, '', 9007199254740992, 'NaN', '-1', '1e3', '0.000000001'])('unverified or Number quantity never becomes exact shares: %s', async shares => {
    const f = fixture(); f.data.lots = [{ ...lot(), shares }];
    await expect(f.read(input)).rejects.toThrow('数量不可用');
    expect(f.log).toHaveLength(1);
  });
  it.each([null, { bad: 'sensitive' }, ''])('invalid name is never stringified into DTO: %j', async stock_name => {
    const f = fixture(); f.data.lots[0].stock_name = stock_name;
    await expect(f.read(input)).rejects.toThrow('名称无效');
  });
  it('no current holdings returns no valuation and does not query prices', async () => {
    const f = fixture(); f.data.lots = [lot(1, 'MSFT', '0')];
    const result = await f.read(input); expect(result.holdings).toEqual([]); unknown(result); expect(f.log).toHaveLength(1);
  });
  it.each([{ member: false }, { viewer: null }, { viewer: { userId: 999 } }, { viewerUserId: 999 }, { ledgerId: 52 }, { aiEnabled: false }])('global unknown/member identity fails before aggregate DB %j', async patch => {
    const f = fixture(); Object.assign(f.state, patch);
    await expect(f.read({ ...input, systemRole: patch.aiEnabled === false ? 'user' : 'admin' })).rejects.toThrow();
    expect(f.db).not.toHaveBeenCalled(); expect(f.log).toHaveLength(0);
  });
  it('nonowner system admin AI-off denied, owner preview allowed but never in viewing-as', async () => {
    const f = fixture(); f.state.aiEnabled = false;
    await expect(f.read({ ...input, systemRole: 'admin' })).rejects.toThrow('尚未开启'); expect(f.db).not.toHaveBeenCalled(); f.state.canManage = true; expect((await f.read(input)).aiEnabled).toBe(false);
    f.log.length = 0;
    await expect(f.read({ ...input, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('尚未开启');
    expect(f.log).toHaveLength(0);
  });
  it('revalidates each target member; both see whole source, never a cached personal slice', async () => {
    const f = fixture(); const first = await f.read(input); safe(first);
    f.state.viewerUserId = 202; f.state.viewer = { userId: 202 };
    const second = await f.read({ ...input, userId: 202, systemRole: 'admin', isViewingAs: true });
    expect(second.viewerUserId).toBe(202); expect(second.holdings).toEqual(first.holdings); safe(second);
    expect(f.auth.mock.calls.map(call => call[0].userId)).toEqual([201, 202]);
    await expect(f.read(input)).rejects.toThrow('身份不匹配');
  });
  it('DB/auth failures are not converted into a false empty holding list', async () => {
    const f = fixture(); f.state.authError = new Error('JSON损坏'); await expect(f.read(input)).rejects.toThrow('JSON损坏');
    f.state.authError = null; f.state.noConnection = true; await expect(f.read(input)).rejects.toThrow('数据库连接不可用');
    f.state.noConnection = false; f.state.lotError = new Error('lot table outage'); await expect(f.read(input)).rejects.toThrow('lot table outage');
  });
  it.each(['ER_NO_SUCH_TABLE', 'ER_TABLEACCESS_DENIED_ERROR', 'ER_COLUMNACCESS_DENIED_ERROR'])('missing/denied valuation evidence only keeps shares and null weights (%s)', async code => {
    const f = fixture(); f.state.quoteError = Object.assign(new Error('unavailable'), { code });
    const result = await f.read(input); expect(result.holdings[0].shares).toBe('100'); unknown(result);
  });
  it('other SQL errors remain visible instead of hiding infrastructure failures', async () => {
    const f = fixture(); f.state.quoteError = new Error('network outage'); await expect(f.read(input)).rejects.toThrow('network outage');
  });
  it.each([{ price: null }, { price: '0' }, { price: 'NaN' }, { price: 'Infinity' }, { price: 10 },
    { currency: 'USD' }, { source: 'intraday' }, { session_date: '2026-11-09' }, { captured_at: '2026-11-10 14:59:00' }, { captured_at: '2099-11-10 15:05:00' }])('bad/stale/untrusted quote invalidates whole denominator %j', async patch => {
    const f = fixture(); f.data.quotes = [proof(1, '600000.SH', '10', patch)]; unknown(await f.read(input));
  });
  it('missing price and conflicting same-instrument cross-project prices are never partial weights', async () => {
    const f = fixture(); f.data.lots = [lot(), lot(2)]; f.data.quotes = [proof()]; unknown(await f.read(input));
    f.data.quotes.push(proof(2, '600000.SH', '11')); unknown(await f.read(input));
    f.data.quotes = [proof(), proof(1, '600000.SH', '11'), proof(2)]; unknown(await f.read(input));
  });
  it.each([{}, { usd_cny_rate: null }, { usd_cny_rate: '0' }, { usd_cny_rate: 7 }, { source: 'default' },
    { quote_as_of: '2026-11-10 14:00:00' }, { quote_as_of: '2026-11-10 15:06:00' }, { locked_at: '2026-11-10 15:06:00' }])('missing/invalid FX keeps all weights null %j', async patch => {
    const f = fixture(); f.data.lots.push(lot(2, 'AAPL', '10')); f.data.quotes.push(proof(2, 'AAPL', '20'));
    f.data.fx = Object.keys(patch).length ? [fx(2, patch)] : []; unknown(await f.read(input));
  });
  it('different per-project FX does not create a mixed denominator', async () => {
    const f = fixture(); f.data.lots.push(lot(2, 'AAPL', '10'), lot(3, 'MSFT', '10'));
    f.data.quotes.push(proof(2, 'AAPL', '20'), proof(3, 'MSFT', '20'));
    f.data.fx = [fx(2), fx(3, { usd_cny_rate: '7.1' })]; unknown(await f.read(input));
  });
  it('USDT is not USD: absent unified crypto valuation keeps the entire source unknown', async () => {
    const f = fixture(); f.data.lots.push(lot(2, 'CRYPTO:BTC-USDT', '0.00000001', '比特币'));
    const result = await f.read(input); expect(result.holdings[1].shares).toBe('0.00000001'); unknown(result);
    expect(f.log).toHaveLength(1);
  });
  it('successful mixed-crypto valuation keeps the source-wide strict DTO free of quote/marketValue details', async () => {
    const f = fixture(); f.data.lots = [lot(), lot(2, 'CRYPTO:BTC-USDT', '0.0001', '比特币')];
    const updatedAt = new Date().toISOString(), date = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    f.data.liveStocks = { '600000.SH': { symbol: '600000.SH', price: 10, priceDate: snapshotDate, updatedAt } };
    f.data.liveCrypto = { 'CRYPTO:BTC-USDT': { symbol: 'CRYPTO:BTC-USDT', price: 50000, priceDate: date, updatedAt } };
    f.data.liveFx = { rate: 7, asOf: updatedAt, source: 'sina_usdcny', pair: 'USD/CNY', stale: false };
    const result = await f.read(input);
    expect(result.reportingCurrency).toBe('CNY'); expect(result.valuationAsOf).toBe(date);
    expect(result.holdings.reduce((sum: number, row: any) => sum + row.weightPct, 0)).toBe(100);
    expect(result.holdings[1].weightPct).toBeCloseTo(35 / 1035 * 100, 10);
    expect(f.log).toHaveLength(1); safe(result);
  });
  it('read path is SELECT-only, no caches/scanners/migrations and ES5-compatible syntax', async () => {
    const f = fixture(); safe(await f.read(input)); expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
    expect(body).not.toMatch(/ensure\w+|fetch\w+|buildPortfolio|getCachedMember|readShortLivedCache|readR1StockPresentationState|INSERT|UPDATE|CREATE|ALTER|DELETE|FOR UPDATE/);
    expect(body).not.toMatch(/\d+n\b|\[\.\.\.new Set|\[\.\.\.\w+\.(?:entries|values)\(/);
    expect((tree as any).parseDiagnostics).toHaveLength(0);
    const es5 = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES5 }, reportDiagnostics: true });
    expect(es5.diagnostics?.filter(row => row.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });
});
