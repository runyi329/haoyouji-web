import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { normalizePortfolioSymbol, portfolioCurrency } from '../shared/portfolio-instruments';
import { getOvernightUsSessionDate } from '../shared/stock-market-session';
import { readTagVisible } from '../shared/tag-visibility';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';
import { replaceTopLevelJsonValue } from './r1-lossless-json';
import { isTrustedMemberCalendarClose } from './shared/stock-member-calendar';

// Execute the actual production helper without importing DB/scanner/startup.
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('portfolio.ts', source, ts.ScriptTarget.Latest, true);
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getMyLedger37MemberHoldingSnapshot')!;
const body = declaration.getText(tree).replace(/^export /, '');
const compile = (text: string) => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
function extract(filename: string, names: string[]) {
  const text = readFileSync(new URL(filename, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  return ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''))
    .map(node => node.getText(ast).replace(/^export /, '')).join('\n');
}
// Include the actual pure SELECT permissions in integration cases, including
// hidden-tag/default-hidden members, malformed balances and viewing-as behavior.
const permissionBody = extract('./ledger37-ai-presentation.ts', [
  'readLedger37Balances', 'readLedger37AiEnabled', 'validateInput',
  'isLedger37AiSystemAdmin', 'readLedger37AiViewer', 'readLedger37PresentationState',
]) + '\n' + extract('./r1-stock-presentation.ts', [
  'readR1Balances', 'readR1AiEnabled', 'validateScope', 'systemAdmin', 'readR1StockPresentationState',
]);
const input = { ledgerId: 37, userId: 201 };
const today = '2026-11-10', snapshotDate = '2026-11-10';
function lot(category_id = 1, symbol = '600000.SH', shares: unknown = '100', stock_name: unknown = '浦发银行', patch: Record<string, unknown> = {}) {
  return { category_id, symbol, shares, stock_name, user_id: 201, ledger_id: 37,
    allocated_quantity: '200', start_date: '2026-11-01', opened_at: '2026-11-01', pause_date: null,
    opening_status: 'active', initial_quantity: '999999', unit_cost: '999', entry_price: '888',
    id: 112, lot_id: 224, orderId: 336, note: '绝密项目', ...patch };
}
function proof(category_id = 1, symbol = '600000.SH', price: unknown = '10', patch: Record<string, unknown> = {}) {
  return { category_id, symbol, price, currency: portfolioCurrency(symbol), source: 'unified_close_yahoo',
    session_date: portfolioCurrency(symbol) === 'USD' ? '2026-11-09' : snapshotDate,
    captured_at: '2026-11-10 15:05:00', ...patch };
}
function fx(category_id = 2, patch: Record<string, unknown> = {}) {
  return { category_id, usd_cny_rate: '7', source: 'yahoo_usdcny_5m', quote_as_of: `${snapshotDate} 15:05:00`, locked_at: `${snapshotDate} 15:05:00`, ...patch };
}
function fixture(realPermissions = false) {
  const state = { member: true, aiEnabled: true, viewerUserId: 201, viewer: { userId: 201 } as any,
    ledgerId: 37, authError: null as any, categoryError: null as any, lotError: null as any,
    quoteError: null as any, fxError: null as any, noConnection: false,
    denied: new Set<number>(), memberRole: 'member',
    balances: JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1 }),
    categoryPatch: {} as Record<string, unknown>, categoryIdentityPatch: {} as Record<string, unknown> };
  const data = { lots: [lot()] as any[], quotes: [proof()] as any[], fx: [] as any[] };
  const log: Array<{ sql: string; values: any[] }> = [];
  const positive = (value: unknown) => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
    ? /[1-9]/.test(value) : true; // malformed values reach the real helper validation
  const effective = (userId: number) => data.lots.filter(row => row.ledger_id === 37 && row.user_id === userId
    && row.opening_status === 'active' && positive(row.allocated_quantity) && positive(row.shares)
    && (row.start_date || row.opened_at || today) <= today);
  const conn = { execute: vi.fn(async (sql: string, values: any[]) => {
    log.push({ sql, values });
    if (!/^\s*SELECT\b/.test(sql) || /FOR UPDATE|GET_LOCK/i.test(sql)) throw new Error('只允许SELECT');
    if (/FROM ledgers l LEFT JOIN ledger_members/.test(sql)) {
      return [[{ ledger_id: state.ledgerId, member_user_id: state.member ? values[0] : null,
        member_role: state.memberRole, initialBalances: state.balances,
        viewer_user_id: state.viewer ? state.viewer.userId : null,
        viewer_username: '姓名不导出', viewer_nickname: '隐私', viewer_avatar: 'secret-avatar' }]];
    }
    if (/FROM ledger_categories c\s+LEFT JOIN ledger_members/.test(sql)) {
      return [[{ id: values[1], ledgerId: 37, name: `隐私类别${values[1]}`, parentId: null,
        accounting_mode: 'stock_portfolio', member_user_id: state.member ? values[0] : null,
        member_role: state.memberRole, initialBalances: state.balances, ...state.categoryPatch }]];
    }
    if (/SELECT DISTINCT p.category_id/.test(sql)) {
      if (state.lotError) throw state.lotError;
      expect(values).toEqual([37, expect.any(Number), today, today]);
      return [Array.from(new Set(effective(values[1]).map(row => row.category_id))).map(id => ({ id }))];
    }
    if (/CAST\(SUM\(p.remaining_quantity\) AS CHAR\)/.test(sql)) {
      if (state.lotError) throw state.lotError;
      expect(values.slice(0, 4)).toEqual([37, expect.any(Number), today, today]);
      return [effective(values[1]).filter(row => values.slice(4).includes(row.category_id))];
    }
    if (/FROM ledger_stock_unified_close_prices/.test(sql)) {
      if (state.quoteError) throw state.quoteError;
      expect(values[0]).toBe(37); expect(values.slice(-2)).toEqual([snapshotDate, '2026-11-09']);
      return [data.quotes];
    }
    if (/FROM ledger_stock_unified_close_fx/.test(sql)) {
      if (state.fxError) throw state.fxError;
      expect(values[0]).toBe(37); expect(values.slice(-2)).toEqual([snapshotDate, 'cn-day-us-overnight-1505-v1']);
      return [data.fx];
    }
    throw new Error('未预期SQL');
  }) };
  const auth = vi.fn(async () => {
    if (state.authError) throw state.authError;
    return { isMember: state.member, context: { ledgerId: state.ledgerId, aiEnabled: state.aiEnabled,
      viewerUserId: state.viewerUserId, viewer: state.viewer, canManage: true } };
  });
  const categoryAuth = vi.fn(async (request: any, connection: any) => {
    expect(connection).toBe(conn);
    if (state.categoryError) throw state.categoryError;
    if (state.denied.has(request.categoryId)) throw new Error('您无权查看此标签');
    return { isMember: state.member, context: { ledgerId: 37, categoryId: request.categoryId,
      viewerUserId: request.userId, aiEnabled: state.aiEnabled, canManage: true, ...state.categoryIdentityPatch } };
  });
  const db = vi.fn(async () => state.noConnection ? null : conn);
  const text = (realPermissions ? permissionBody + '\n' : '') + body + '\ngetMyLedger37MemberHoldingSnapshot;';
  const read = runInNewContext(compile(text), { Error, Map, Set, BigInt, Number, JSON, Array, Date,
    readLedger37PresentationState: auth, readR1StockPresentationState: categoryAuth,
    getDbConnection: db, normalizeSymbol: normalizePortfolioSymbol, stockCurrency: portfolioCurrency,
    beijingDate: () => today, getUnifiedStockCloseSnapshotDate: () => snapshotDate, getOvernightUsSessionDate,
    toBeijingWallClockIso: (value: unknown) => typeof value === 'string' ? value.replace(' ', 'T') + '+08:00' : '',
    isTrustedMemberCalendarClose, STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION: 'cn-day-us-overnight-1505-v1',
    readTagVisible, LEDGER37_AI_DISPLAY_KEY, replaceTopLevelJsonValue, R1_STOCK_LEDGER_ID: 37,
  }, { timeout: 1000 }) as (request: any) => Promise<any>;
  return { state, data, log, conn, auth, categoryAuth, db, read };
}
function safe(result: any) {
  expect(Object.keys(result).sort()).toEqual(['aiEnabled', 'holdings', 'reportingCurrency', 'valuationAsOf', 'viewerUserId']);
  expect(JSON.stringify(result)).not.toMatch(/category|lot_id|lotId|order|project|绝密|隐私|"userId"|allocated|entry_price|unit_cost|"price"|cost|members|participation|username|avatar/i);
  for (const holding of result.holdings) {
    expect(Object.keys(holding).sort()).toEqual(['currency', 'marketValue', 'shares', 'stockName', 'symbol', 'weightPct']);
    if (holding.marketValue) {
      expect(Object.keys(holding.marketValue).sort()).toEqual(['amount', 'asOf', 'currency']);
      expect(holding.marketValue.asOf).toBe(result.valuationAsOf);
      expect(holding.marketValue.currency).toBe(result.reportingCurrency);
      expect(holding.marketValue.amount).toMatch(/^\d+(?:\.\d{1,18})?$/);
    }
  }
}
function unknown(result: any) {
  expect(result.holdings.every((row: any) => row.marketValue === null && row.weightPct === null)).toBe(true);
  expect(result.valuationAsOf).toBeNull(); expect(result.reportingCurrency).toBeNull(); safe(result);
}

describe('ledger37 personal holding snapshot: real remaining shares, exact values and pure SELECT', () => {
  it('uses personal remaining shares, excludes closed/pending/nonallocations/other users/inactive openings; paused shares remain owned', async () => {
    const f = fixture();
    f.data.lots = [lot(1, '600000.SH', '2', '浦发银行', { pause_date: '2026-11-02' }),
      lot(1, '600000.SH', '0'), lot(2, 'MSFT', '500', '微软', { start_date: '2026-11-11' }),
      lot(3, 'AAPL', '500', '苹果', { allocated_quantity: '0' }),
      lot(4, 'AAPL', '500', '苹果', { user_id: 999 }),
      lot(5, 'AAPL', '500', '苹果', { ledger_id: 52 }),
      lot(6, 'AAPL', '500', '苹果', { opening_status: 'void' })];
    const result = await f.read(input);
    expect(result.holdings).toEqual([{ symbol: '600000.SH', stockName: '浦发银行', currency: 'CNY', shares: '2',
      weightPct: 100, marketValue: { amount: '20', currency: 'CNY', asOf: snapshotDate } }]); safe(result);
    expect(f.categoryAuth.mock.calls.map(call => call[0].categoryId)).toEqual([1]);
    for (const entry of f.log.filter(row => /FROM ledger_stock_lot_participations/.test(row.sql))) {
      expect(entry.sql).toContain('p.user_id=?'); expect(entry.sql).toContain('p.ledger_id=?');
      expect(entry.sql).toContain('p.remaining_quantity>0'); expect(entry.sql).toContain('p.allocated_quantity>0');
      expect(entry.sql).toContain('COALESCE(p.start_date, DATE(l.opened_at), ?) <= ?');
      expect(entry.sql).toContain("opening.status='active'");
      expect(entry.sql).toContain('l.ledger_id=p.ledger_id AND l.category_id=p.category_id');
      expect(entry.sql).not.toMatch(/observations|pause_date|initial_quantity|entry_price|sale_price|unit_cost/);
    }
    expect(f.log[1].sql).toContain('CAST(SUM(p.remaining_quantity) AS CHAR)');
    expect(f.auth.mock.invocationCallOrder[0]).toBeLessThan(f.db.mock.invocationCallOrder[0]);
    expect(f.categoryAuth.mock.invocationCallOrder[0]).toBeLessThan(f.conn.execute.mock.invocationCallOrder[1]);
  });
  it('merges symbol+currency across allowed categories exactly, not identical names across different securities', async () => {
    const f = fixture(); f.data.lots = [lot(1, '600000.SH', '9007199254740993.00000001', '同名'),
      lot(2, '600000.SH', '0.00000009', '同名'), lot(3, '600001.SH', '1.12345678', '同名')];
    f.data.quotes = [];
    const result = await f.read(input);
    expect(result.holdings.map((row: any) => [row.symbol, row.shares])).toEqual([
      ['600000.SH', '9007199254740993.0000001'], ['600001.SH', '1.12345678']]); unknown(result);
  });
  it('same-currency reports personal market values and value weights, never whole-lot quantity ratios', async () => {
    const f = fixture(); f.data.lots = [lot(1, 'AAPL', '10', '同名'), lot(2, 'MSFT', '10', '同名')];
    f.data.quotes = [proof(1, 'AAPL', '20'), proof(2, 'MSFT', '10')];
    const result = await f.read(input);
    expect(result.reportingCurrency).toBe('USD'); expect(result.valuationAsOf).toBe(snapshotDate);
    expect(result.holdings.map((row: any) => row.marketValue.amount)).toEqual(['200', '100']);
    expect(result.holdings[0].weightPct).toBeCloseTo(200 / 300 * 100, 10);
    expect(result.holdings[1].weightPct).toBeCloseTo(100 / 300 * 100, 10);
    expect(f.log.some(row => /FROM ledger_stock_unified_close_fx/.test(row.sql))).toBe(false); safe(result);
  });
  it('mixed currencies and multiple categories use matching strict snapshot FX in a single personal CNY denominator', async () => {
    const f = fixture(); f.data.lots = [lot(1), lot(2, 'AAPL', '10', '苹果'), lot(3, 'AAPL', '5', '苹果')];
    f.data.quotes = [proof(), proof(2, 'AAPL', '20'), proof(3, 'AAPL', '20')]; f.data.fx = [fx(2), fx(3)];
    const result = await f.read(input); expect(result.reportingCurrency).toBe('CNY');
    expect(result.holdings.map((row: any) => [row.shares, row.marketValue.amount])).toEqual([['100', '1000'], ['15', '2100']]);
    expect(result.holdings[0].weightPct).toBeCloseTo(1000 / 3100 * 100, 10);
    expect(result.holdings[1].weightPct).toBeCloseTo(2100 / 3100 * 100, 10); safe(result);
  });
  it('keeps huge and 8-decimal inputs exact with no floating point multiplication', async () => {
    const f = fixture(); f.data.lots = [lot(1, '600000.SH', '9007199254740993.12345678')];
    f.data.quotes = [proof(1, '600000.SH', '1.00000001')];
    const result = await f.read(input);
    expect(result.holdings[0].marketValue.amount).toBe('9007199344812985.6708667112345678');
    expect(result.holdings[0].weightPct).toBe(100); safe(result);
  });
  it('fixed-point rounds mixed-currency amount to at most 18dp without changing the exact denominator', async () => {
    const f = fixture(); f.data.lots = [lot(1, '600000.SH', '0.00000001'), lot(2, 'AAPL', '0.00000001', '苹果')];
    f.data.quotes = [proof(1, '600000.SH', '0.00000001'), proof(2, 'AAPL', '0.00000001')];
    f.data.fx = [fx(2, { usd_cny_rate: '7.12345678' })];
    const result = await f.read(input);
    expect(result.holdings[0].marketValue.amount).toBe('0.0000000000000001');
    expect(result.holdings[1].marketValue.amount).toBe('0.000000000000000712'); safe(result);
  });
  it.each([null, undefined, '', 9007199254740992, 'NaN', '-1', '1e3', '0.000000001'])('invalid/Number shares fail rather than becoming zero or imprecise %s', async shares => {
    const f = fixture(); f.data.lots = [{ ...lot(), shares }];
    await expect(f.read(input)).rejects.toThrow('数量不可用');
    expect(f.log.some(row => /unified_close/.test(row.sql))).toBe(false);
  });
  it.each([null, { bad: 'sensitive' }, ''])('invalid security name is not stringified into DTO %j', async name => {
    const f = fixture(); f.data.lots = [lot(1, '600000.SH', '1', name)];
    await expect(f.read(input)).rejects.toThrow('名称无效');
  });
  it('no allocation is empty and never queries full source or prices', async () => {
    const f = fixture(); f.data.lots = [lot(1, '600000.SH', '0'), lot(2, 'MSFT', '100', '微软', { user_id: 999 })];
    const result = await f.read(input); expect(result.holdings).toEqual([]); unknown(result);
    expect(f.categoryAuth).not.toHaveBeenCalled(); expect(f.log).toHaveLength(1);
  });
  it('does not combine observers: the read SQL never touches observation quantities/tables', async () => {
    const f = fixture(); f.data.lots = [];
    expect((await f.read(input)).holdings).toEqual([]);
    expect(body).not.toMatch(/ledger_stock_lot_observations|buildMyStockTagObservation|quantity\s*\*/);
  });
  it.each([{ member: false }, { viewer: null }, { viewer: { userId: 999 } }, { viewerUserId: 999 }, { ledgerId: 52 }, { aiEnabled: false }])('global identity fails before personal DB even if canManage %j', async patch => {
    const f = fixture(); Object.assign(f.state, patch);
    await expect(f.read({ ...input, systemRole: patch.aiEnabled === false ? 'user' : 'admin' })).rejects.toThrow();
    expect(f.db).not.toHaveBeenCalled(); expect(f.log).toHaveLength(0);
  });
  it('system admin AI-off own member access remains allowed but viewing-as cannot inherit this privilege', async () => {
    const f = fixture(); f.state.aiEnabled = false;
    expect((await f.read({ ...input, systemRole: 'admin' })).aiEnabled).toBe(false); f.log.length = 0;
    await expect(f.read({ ...input, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('尚未开启'); expect(f.log).toHaveLength(0);
  });
  it('denied category is excluded before shares/evidence SELECT; never counted in personal denominator', async () => {
    const f = fixture(); f.data.lots.push(lot(2, 'AAPL', '10000', '苹果')); f.state.denied.add(2);
    const result = await f.read(input); expect(result.holdings).toHaveLength(1); expect(result.holdings[0].weightPct).toBe(100);
    expect(f.log[1].values.slice(4)).toEqual([1]); expect(f.log[2].values).toEqual([37, 1, snapshotDate, '2026-11-09']); safe(result);
    f.state.denied.add(1); f.log.length = 0;
    expect((await f.read(input)).holdings).toEqual([]); expect(f.log).toHaveLength(1);
  });
  it.each([{ viewerUserId: 999 }, { ledgerId: 52 }, { categoryId: 999 }])('category identity mismatch fails before reading quantities %j', async patch => {
    const f = fixture(); f.state.categoryIdentityPatch = patch;
    await expect(f.read(input)).rejects.toThrow('身份不匹配'); expect(f.log).toHaveLength(1);
  });
  it.each([true, false])('category/global AI changes fail before shares even for system admin (global %s)', async enabled => {
    const f = fixture(); f.state.aiEnabled = enabled; f.state.categoryIdentityPatch = { aiEnabled: !enabled };
    await expect(f.read({ ...input, systemRole: 'admin' })).rejects.toThrow('AI状态已变化');
    expect(f.log).toHaveLength(1);
  });
  it('same helper reauthorizes and reads the effective viewing-as member, no cached/fallback slice', async () => {
    const f = fixture(); f.data.lots.push(lot(1, '600000.SH', '3', '浦发银行', { user_id: 202 }));
    expect((await f.read(input)).holdings[0].shares).toBe('100');
    f.state.viewerUserId = 202; f.state.viewer = { userId: 202 };
    const result = await f.read({ ...input, userId: 202, systemRole: 'admin', isViewingAs: true });
    expect(result.holdings[0].shares).toBe('3'); expect(result.holdings[0].marketValue.amount).toBe('30'); safe(result);
    expect(f.auth.mock.calls.map(call => call[0].userId)).toEqual([201, 202]);
  });
  it('authentication, category and holdings infrastructure errors remain errors, not empty holdings', async () => {
    const f = fixture(); f.state.authError = new Error('JSON损坏'); await expect(f.read(input)).rejects.toThrow('JSON损坏');
    f.state.authError = null; f.state.categoryError = new Error('category outage'); await expect(f.read(input)).rejects.toThrow('category outage');
    f.state.categoryError = null; f.state.lotError = new Error('lot outage'); await expect(f.read(input)).rejects.toThrow('lot outage');
    f.state.lotError = null; f.state.noConnection = true; await expect(f.read(input)).rejects.toThrow('数据库连接不可用');
  });
  it.each(['ER_NO_SUCH_TABLE', 'ER_TABLEACCESS_DENIED_ERROR', 'ER_COLUMNACCESS_DENIED_ERROR'])('missing/denied close evidence preserves shares and all unknown values %s', async code => {
    const f = fixture(); f.state.quoteError = Object.assign(new Error('unavailable'), { code });
    const result = await f.read(input); expect(result.holdings[0].shares).toBe('100'); unknown(result);
  });
  it('other quote failures remain infrastructure errors', async () => {
    const f = fixture(); f.state.quoteError = new Error('network outage'); await expect(f.read(input)).rejects.toThrow('network outage');
  });
  it.each([{ price: null }, { price: '0' }, { price: 'NaN' }, { price: 'Infinity' }, { price: 10 },
    { price: '0.000000001' }, { currency: 'USD' }, { source: 'intraday' }, { session_date: '2026-11-09' },
    { captured_at: '2026-11-10 14:59:00' }, { captured_at: '2099-11-10 15:05:00' }])('invalid/untrusted quote leaves every value and weight unknown %j', async patch => {
    const f = fixture(); f.data.quotes = [proof(1, '600000.SH', '10', patch)]; unknown(await f.read(input));
  });
  it('missing prices or conflicting same-stock cross-category proofs do not assign partial marketValues', async () => {
    const f = fixture(); f.data.lots.push(lot(2)); unknown(await f.read(input));
    f.data.quotes.push(proof(2, '600000.SH', '11')); unknown(await f.read(input));
    f.data.quotes = [proof(), proof(1, '600000.SH', '11'), proof(2)]; unknown(await f.read(input));
  });
  it.each([{}, { usd_cny_rate: null }, { usd_cny_rate: '0' }, { usd_cny_rate: 7 }, { source: 'default' },
    { quote_as_of: '2026-11-10 14:00:00' }, { quote_as_of: '2026-11-10 15:06:00' }, { locked_at: '2026-11-10 15:06:00' }])('missing/bad/stale FX leaves all personal values null %j', async patch => {
    const f = fixture(); f.data.lots.push(lot(2, 'AAPL', '10', '苹果')); f.data.quotes.push(proof(2, 'AAPL', '20'));
    f.data.fx = Object.keys(patch).length ? [fx(2, patch)] : []; unknown(await f.read(input));
  });
  it('different category FX cannot form a denominator or mixed-date amounts', async () => {
    const f = fixture(); f.data.lots.push(lot(2, 'AAPL', '10', '苹果'), lot(3, 'MSFT', '10', '微软'));
    f.data.quotes.push(proof(2, 'AAPL', '20'), proof(3, 'MSFT', '20')); f.data.fx = [fx(2), fx(3, { usd_cny_rate: '7.1' })];
    unknown(await f.read(input));
  });
  it('USDT never borrows USD archived close/FX, making the complete personal valuation unknown', async () => {
    const f = fixture(); f.data.lots.push(lot(2, 'CRYPTO:BTC-USDT', '0.00000001', '比特币'));
    const result = await f.read(input); expect(result.holdings[1].shares).toBe('0.00000001'); unknown(result);
    expect(f.log).toHaveLength(2);
  });
  it('read body has only SELECT, approved pure read auth and no full-source/funds/cache/scanner/migrations', async () => {
    const f = fixture(); safe(await f.read(input)); expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
    expect(body).not.toMatch(/ensure\w+|fetch\w+|buildPortfolio|getCachedMember|readShortLivedCache|getMyLedger37R1HoldingSnapshot|INSERT|UPDATE|CREATE|ALTER|DELETE|FOR UPDATE|getDbTransactionConnection|beginTransaction|getUsdtCnyRate/);
    expect(body).not.toMatch(/\d+n\b|\[\.\.\.new Set|\[\.\.\.\w+\.(?:entries|values)\(/);
    expect((tree as any).parseDiagnostics).toHaveLength(0);
    const es5 = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES5 }, reportDiagnostics: true });
    expect(es5.diagnostics?.filter(row => row.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });
});

describe('personal holding snapshot with actual global + category pure SELECT permissions', () => {
  it('reads actual member identity/global AI and actual visibility without DDL/cache/scanner', async () => {
    const f = fixture(true); const result = await f.read(input); expect(result.holdings[0].marketValue.amount).toBe('1000'); safe(result);
    expect(f.log[0].sql).toContain('FROM ledgers'); expect(f.log[2].sql).toContain('FROM ledger_categories');
    expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
  });
  it.each(['member', 'admin'])('actual hidden member category is denied even for role %s with viewing-as system admin', async role => {
    const f = fixture(true); f.state.memberRole = role;
    f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, '隐私类别1__visible': 0 });
    const result = await f.read({ ...input, systemRole: 'admin', isViewingAs: true });
    expect(result.holdings).toEqual([]); unknown(result); expect(f.log).toHaveLength(3);
  });
  it('default-hidden actual member with real allocation cannot bypass pure category authorization', async () => {
    const f = fixture(true); f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, __tagVisibilityDefault: 0 });
    expect((await f.read(input)).holdings).toEqual([]);
    f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, __tagVisibilityDefault: 0, '隐私类别1__visible': 1 });
    expect((await f.read(input)).holdings[0].shares).toBe('100');
  });
  it('actual owner visibility exemption stays old behavior, not a new bypass', async () => {
    const f = fixture(true); f.state.memberRole = 'owner';
    f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, '隐私类别1__visible': 0 });
    expect((await f.read(input)).holdings[0].shares).toBe('100');
  });
  it('actual system-admin role never bypasses hidden member categories even outside viewing-as', async () => {
    const f = fixture(true); f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, '隐私类别1__visible': 0 });
    expect((await f.read({ ...input, systemRole: 'admin' })).holdings).toEqual([]);
  });
  it('actual category nonmember/invalid scope/malformed balances errors stay visible', async () => {
    const f = fixture(true); f.state.categoryPatch = { parentId: 9 };
    await expect(f.read(input)).rejects.toThrow('不是股票持仓模式');
    f.state.categoryPatch = { member_user_id: null };
    await expect(f.read({ ...input, systemRole: 'admin' })).rejects.toThrow('不是此账本的成员');
    f.state.categoryPatch = { initialBalances: '{bad' }; await expect(f.read(input)).rejects.toThrow('JSON损坏');
  });
  it.each([{ member: false }, { viewer: null }, { viewer: { userId: 999 } }, { balances: '{bad' }, { balances: JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: '1' }) }])('actual pure global read rejects unknown identity/invalid settings before participation read %j', async patch => {
    const f = fixture(true); Object.assign(f.state, patch);
    await expect(f.read({ ...input, systemRole: 'admin' })).rejects.toThrow();
    expect(f.log.every(row => /FROM ledgers/.test(row.sql))).toBe(true);
  });
});
