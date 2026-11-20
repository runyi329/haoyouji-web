import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { normalizePortfolioSymbol } from '../shared/portfolio-instruments';
import { readTagVisible } from '../shared/tag-visibility';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';
import { replaceTopLevelJsonValue } from './r1-lossless-json';

// Only execute the actual read functions in an offline VM. Never import db,
// scanners, startup, dotenv, a transaction or any network client.
function extract(filename: string, names: string[]) {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  return tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''))
    .map(node => node.getText(tree).replace(/^export /, '')).join('\n');
}
const body = extract('./ledger-stock-portfolio.ts', ['stockObservationTableExists', 'getMyLedger37MemberClosedTrades']);
const permissionBody = extract('./ledger37-ai-presentation.ts', [
  'readLedger37Balances', 'readLedger37AiEnabled', 'validateInput',
  'isLedger37AiSystemAdmin', 'readLedger37AiViewer', 'readLedger37PresentationState',
]) + '\n' + extract('./r1-stock-presentation.ts', [
  'readR1Balances', 'readR1AiEnabled', 'validateScope', 'systemAdmin', 'readR1StockPresentationState',
]);
const input = { ledgerId: 37, userId: 201 };
const today = '2026-11-19';
function closure(patch: Record<string, unknown> = {}) {
  return { category_id: 1, ledger_id: 37, user_id: 201, symbol: '600000.SH', stock_name: '浦发银行',
    closed_quantity: '10', opening_actual_traded_at: '2026-11-02 10:00:00', opened_at: '2026-11-01 10:00:00',
    closing_actual_traded_at: '2026-11-18 14:00:00', opening_status: 'active', closing_status: 'active',
    opening_type: 'buy', closing_type: 'sell', matching_lot: true, matching_opening: true,
    matching_sale: true, matching_allocation: true, has_participation: true,
    observation_enabled: false, allocated_quantity: '0', remaining_quantity: '0',
    sale_quantity: '10', allocation_quantity: '10', start_date: '2026-11-01',
    // Private fields and recording dates must never leak or substitute trade time.
    closed_at: '2026-11-19 11:12:13', assigned_at: '2026-11-19 11:12:13', created_at: '2026-11-19 11:12:13',
    server_registered_at: '2026-11-19 11:12:13', sale_price: '999', pnl: '888', lot_id: 22, sell_event_id: 33,
    participation_id: 44, projectName: 'SECRET', ...patch };
}
function fixture(realPermissions = false) {
  const state = { member: true, aiEnabled: true, viewer: { userId: 201 } as any, viewerUserId: 201, ledgerId: 37,
    denied: new Set<number>(), categoryPatch: {} as any, identityPatch: {} as any,
    memberRole: 'member', balances: JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1 }),
    observationTableExists: true, readError: null as any, categoryError: null as any, noConnection: false };
  const data = { rows: [closure()] as any[] };
  const log: Array<{ sql: string; values: any[] }> = [];
  const positive = (value: unknown) => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
    ? !value.startsWith('-') && /[1-9]/.test(value) : true;
  const effective = (userId: number) => data.rows.filter(row => row.ledger_id === 37 && row.user_id === userId
    && row.has_participation && row.matching_lot && row.matching_opening && row.matching_sale && row.matching_allocation
    && row.opening_status === 'active' && row.closing_status === 'active'
    && ['buy', 'add'].includes(row.opening_type) && ['reduce', 'sell'].includes(row.closing_type)
    && positive(row.closed_quantity) && positive(row.sale_quantity) && positive(row.allocation_quantity)
    && (row.start_date || row.opened_at || today) <= today
    && !(state.observationTableExists && row.observation_enabled));
  const conn = { execute: vi.fn(async (sql: string, values: any[] = []) => {
    log.push({ sql, values });
    if (!/^\s*SELECT\b/.test(sql) || /FOR UPDATE|GET_LOCK/i.test(sql)) throw new Error('Offline fixture permits SELECT only');
    if (/FROM ledgers l LEFT JOIN ledger_members/.test(sql)) return [[{
      ledger_id: state.ledgerId, member_user_id: state.member ? values[0] : null,
      member_role: state.memberRole, initialBalances: state.balances,
      viewer_user_id: state.viewer ? state.viewer.userId : null, viewer_username: 'SECRET',
    }]];
    if (/FROM ledger_categories c\s+LEFT JOIN ledger_members/.test(sql)) return [[{
      id: values[1], ledgerId: 37, name: `隐私类别${values[1]}`, parentId: null, accounting_mode: 'stock_portfolio',
      member_user_id: state.member ? values[0] : null, member_role: state.memberRole,
      initialBalances: state.balances, ...state.categoryPatch,
    }]];
    if (/FROM information_schema.tables/.test(sql)) return [state.observationTableExists ? [{ TABLE_NAME: 'ledger_stock_lot_observations' }] : []];
    if (/FROM ledger_stock_participation_closures c/.test(sql)) {
      if (state.readError) throw state.readError;
      expect(values.slice(0, 4)).toEqual([37, expect.any(Number), today, today]);
      const rows = effective(values[1]);
      if (/SELECT DISTINCT p.category_id/.test(sql)) return [Array.from(new Set(rows.map(row => row.category_id))).map(id => ({ id }))];
      expect(sql).toContain('AND p.category_id IN (');
      return [rows.filter(row => values.slice(4).includes(row.category_id))];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }) };
  const auth = vi.fn(async () => ({ isMember: state.member, context: {
    ledgerId: state.ledgerId, viewerUserId: state.viewerUserId, viewer: state.viewer,
    aiEnabled: state.aiEnabled, canManage: true,
  } }));
  const categoryAuth = vi.fn(async (request: any, connection: any) => {
    expect(connection).toBe(conn);
    if (state.categoryError) throw state.categoryError;
    if (state.denied.has(request.categoryId)) throw new Error('您无权查看此标签');
    return { isMember: state.member, context: { ledgerId: 37, categoryId: request.categoryId,
      viewerUserId: request.userId, aiEnabled: state.aiEnabled, ...state.identityPatch } };
  });
  const db = vi.fn(async () => state.noConnection ? null : conn);
  const code = ts.transpileModule((realPermissions ? permissionBody + '\n' : '') + body + '\ngetMyLedger37MemberClosedTrades;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const read = runInNewContext(code, { Error, Number, JSON, Array, Date, Intl, Map, Set,
    readLedger37PresentationState: auth, readR1StockPresentationState: categoryAuth, getDbConnection: db,
    normalizeSymbol: normalizePortfolioSymbol, beijingDate: () => today,
    readTagVisible, LEDGER37_AI_DISPLAY_KEY, replaceTopLevelJsonValue, R1_STOCK_LEDGER_ID: 37,
  }, { timeout: 1000 }) as (request: any) => Promise<any>;
  return { state, data, log, conn, db, auth, categoryAuth, read };
}
function safe(result: any) {
  expect(Object.keys(result).sort()).toEqual(['aiEnabled', 'closedTrades', 'viewerUserId']);
  for (const row of result.closedTrades) expect(Object.keys(row).sort()).toEqual(['closedDate', 'openedDate', 'stockName', 'symbol']);
  expect(JSON.stringify(result)).not.toMatch(/SECRET|category|participation|lot_id|sell_event|user_id|price|pnl|quantity|allocated|remaining|assigned|created|registered/i);
}

describe('ledger37 actual member closure history: offline VM pure SELECT', () => {
  it('preserves each real partial closure including identical display dates; allocated/remaining zero does not hide history', async () => {
    const f = fixture(); f.data.rows = [closure(), closure({ closed_quantity: '5' }), closure({ closing_actual_traded_at: '2026-11-10 10:00:00' })];
    const result = await f.read(input); safe(result);
    expect(result.closedTrades).toEqual([
      { symbol: '600000.SH', stockName: '浦发银行', openedDate: '2026-11-02', closedDate: '2026-11-18' },
      { symbol: '600000.SH', stockName: '浦发银行', openedDate: '2026-11-02', closedDate: '2026-11-18' },
      { symbol: '600000.SH', stockName: '浦发银行', openedDate: '2026-11-02', closedDate: '2026-11-10' },
    ]);
    expect(f.categoryAuth).toHaveBeenCalledTimes(1);
    expect(f.categoryAuth.mock.invocationCallOrder[0]).toBeLessThan(f.conn.execute.mock.invocationCallOrder[2]);
  });
  it('does not infer any member sale from global sales or absent participant/lot/event/allocation joins', async () => {
    const f = fixture();
    f.data.rows = [closure(), ...['has_participation', 'matching_lot', 'matching_opening', 'matching_sale', 'matching_allocation'].map(key => closure({ [key]: false })),
      closure({ user_id: 999 }), closure({ ledger_id: 52 }), closure({ opening_status: 'voided' }), closure({ closing_status: 'voided' }),
      closure({ opening_type: 'note' }), closure({ closing_type: 'note' }), closure({ start_date: '2099-01-01' }),
      closure({ closed_quantity: '0' }), closure({ closed_quantity: '-1' }), closure({ allocation_quantity: '0' }), closure({ sale_quantity: '0' })];
    expect((await f.read(input)).closedTrades).toHaveLength(1);
    for (const { sql } of f.log.filter(row => /FROM ledger_stock_participation_closures c/.test(row.sql))) {
      expect(sql).toContain('p.ledger_id=? AND p.user_id=? AND c.quantity>0');
      expect(sql).toContain('sale.id=c.sell_event_id');
      expect(sql).toContain('sale.ledger_id=p.ledger_id AND sale.category_id=p.category_id');
      expect(sql).toContain('opening.ledger_id=p.ledger_id AND opening.category_id=p.category_id');
      expect(sql).toContain('l.ledger_id=p.ledger_id AND l.category_id=p.category_id');
      expect(sql).toContain('a.event_id=c.sell_event_id AND a.lot_id=l.id AND a.quantity>0');
      expect(sql).toContain("sale.status='active'"); expect(sql).toContain("opening.status='active'");
      expect(sql).not.toMatch(/MAX\(|GROUP BY|allocated_quantity|remaining_quantity|sale_price|entry_price|execution_price/);
    }
  });
  it('strictly positive 18dp quantities are kept without floating point or epsilon', async () => {
    const f = fixture(); f.data.rows = [closure({ closed_quantity: '0.000000000000000001' }), closure({ closed_quantity: '9007199254740993.123456789012345678' })];
    const result = await f.read(input); expect(result.closedTrades).toHaveLength(2); safe(result);
    expect(body).toContain('CAST(c.quantity AS CHAR)'); expect(body).not.toMatch(/parseFloat|Number\(row.closed_quantity\)|EPSILON/);
  });
  it.each([null, 1, '', 'NaN', '1e-18', '0.0000000000000000001', '1.2.3'])('malformed or lossy quantity fails closed %j', async value => {
    const f = fixture(); f.data.rows = [closure({ closed_quantity: value })];
    await expect(f.read(input)).rejects.toThrow('数量不可用');
  });
  it('dates use actual trading Beijing day, not US session, participation or accounting registration dates', async () => {
    const f = fixture(); f.data.rows = [closure({ symbol: 'NVDA', stock_name: '英伟达',
      opening_actual_traded_at: '2026-11-03 01:00:00', closing_actual_traded_at: '2026-11-18T18:10:00Z' })];
    const result = await f.read(input);
    expect(result.closedTrades[0]).toEqual({ symbol: 'NVDA', stockName: '英伟达', openedDate: '2026-11-03', closedDate: '2026-11-19' }); safe(result);
  });
  it('uses real lot opened_at fallback, but never default closure closed_at or created/assigned/today for missing close date', async () => {
    const f = fixture(); f.data.rows = [closure({ opening_actual_traded_at: null, closing_actual_traded_at: null })];
    expect((await f.read(input)).closedTrades[0]).toMatchObject({ openedDate: '2026-11-01', closedDate: null });
    f.data.rows = [closure({ opening_actual_traded_at: null, opened_at: null, closing_actual_traded_at: null })];
    expect((await f.read(input)).closedTrades[0]).toMatchObject({ openedDate: null, closedDate: null });
    expect(body).not.toMatch(/c.closed_at|assigned_at|created_at|server_registered_at|settlement_effective_date/);
  });
  it.each(['2026-02-30 10:00:00', '2026-11-18 25:00:00', '0000-00-00', '', 'not a date', '2099garbage'])('invalid actual date never fabricates a trading date %s', async value => {
    const f = fixture(); f.data.rows = [closure({ opening_actual_traded_at: value, opened_at: value, closing_actual_traded_at: value })];
    expect((await f.read(input)).closedTrades[0]).toMatchObject({ openedDate: null, closedDate: null });
  });
  it('timezone-bearing Date objects convert explicitly to Beijing', async () => {
    const f = fixture(); f.data.rows = [closure({ opening_actual_traded_at: new Date('2026-11-02T20:00:00Z'), closing_actual_traded_at: new Date('2026-11-18T20:00:00Z') })];
    expect((await f.read(input)).closedTrades[0]).toMatchObject({ openedDate: '2026-11-03', closedDate: '2026-11-19' });
  });
  it('observers are never included; absent optional observation table is read-only compatible', async () => {
    const f = fixture(); f.data.rows = [closure({ observation_enabled: true })];
    expect((await f.read(input)).closedTrades).toEqual([]);
    expect(f.categoryAuth).not.toHaveBeenCalled();
    f.state.observationTableExists = false;
    expect((await f.read(input)).closedTrades).toHaveLength(1);
    expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
    const guard = f.log.find(row => /NOT EXISTS/.test(row.sql))!.sql;
    expect(guard).toContain('o.ledger_id=p.ledger_id AND o.category_id=p.category_id');
    expect(guard).toContain('o.lot_id=p.lot_id AND o.user_id=p.user_id AND o.enabled=1');
  });
  it('hidden categories removed before closure-detail read and no current holding is required', async () => {
    const f = fixture(); f.data.rows.push(closure({ category_id: 2 })); f.state.denied.add(2);
    expect((await f.read(input)).closedTrades).toHaveLength(1);
    expect(f.log[2].values).toEqual([37, 201, today, today, 1]);
    f.state.denied.add(1); f.log.length = 0;
    expect((await f.read(input)).closedTrades).toEqual([]); expect(f.log).toHaveLength(2);
  });
  it.each([{ member: false }, { viewer: null }, { viewer: { userId: 999 } }, { viewerUserId: 999 }, { ledgerId: 52 }, { aiEnabled: false }])('fails global authorization before any DB metadata or detail %j', async patch => {
    const f = fixture(); Object.assign(f.state, patch);
    await expect(f.read(input)).rejects.toThrow(); expect(f.db).not.toHaveBeenCalled(); expect(f.log).toEqual([]);
  });
  it('system administrator AI-off is self-only and viewing-as loses that privilege', async () => {
    const f = fixture(); f.state.aiEnabled = false;
    expect((await f.read({ ...input, systemRole: 'admin' })).aiEnabled).toBe(false); f.log.length = 0;
    await expect(f.read({ ...input, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('尚未开启'); expect(f.log).toEqual([]);
  });
  it('viewing-as reads effective member alone and reauthorizes on every call', async () => {
    const f = fixture(); f.data.rows.push(closure({ user_id: 202, symbol: 'MSFT', stock_name: '微软' }));
    expect((await f.read(input)).closedTrades[0].symbol).toBe('600000.SH');
    f.state.viewer = { userId: 202 }; f.state.viewerUserId = 202;
    expect((await f.read({ ...input, userId: 202, isViewingAs: true, systemRole: 'admin' })).closedTrades[0].symbol).toBe('MSFT');
    expect(f.auth).toHaveBeenCalledTimes(2);
  });
  it.each([{ viewerUserId: 999 }, { categoryId: 999 }, { ledgerId: 52 }, { aiEnabled: false }])('category changed identity/AI fails before detail read %j', async patch => {
    const f = fixture(); f.state.identityPatch = patch;
    await expect(f.read(input)).rejects.toThrow(); expect(f.log).toHaveLength(2);
  });
  it('infrastructure errors remain errors rather than empty history or guessing global sales', async () => {
    const f = fixture(); f.state.readError = Object.assign(new Error('closure table unavailable'), { code: 'ER_NO_SUCH_TABLE' });
    await expect(f.read(input)).rejects.toThrow('closure table unavailable');
    f.state.readError = null; f.state.categoryError = new Error('category unavailable');
    await expect(f.read(input)).rejects.toThrow('category unavailable');
    f.state.categoryError = null; f.state.noConnection = true;
    await expect(f.read(input)).rejects.toThrow('数据库连接不可用');
  });
  it('production body has no writes, DDL, caches, quotes, funds or ES5-incompatible BigInt literals / Set spread', async () => {
    const f = fixture(); safe(await f.read(input));
    expect(body).not.toMatch(/ensure\w+|fetch\w+|getCached|readShortLivedCache|getMyLedger37R1HoldingSnapshot|INSERT|UPDATE|CREATE|ALTER|DELETE|FOR UPDATE|getDbTransactionConnection|beginTransaction|parseFloat|\d+n\b|\[\.\.\.new Set/);
    const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES5 }, reportDiagnostics: true });
    expect(compiled.diagnostics?.filter(row => row.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });
});

describe('member closure history with actual pure global/category permissions in offline VM', () => {
  it('runs actual SELECT permissions without DDL, retaining zero-allocated history', async () => {
    const f = fixture(true); const result = await f.read(input); safe(result); expect(result.closedTrades).toHaveLength(1);
    expect(f.log[0].sql).toContain('FROM ledgers'); expect(f.log[3].sql).toContain('FROM ledger_categories');
    expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
  });
  it.each(['member', 'admin'])('actual hidden role %s cannot bypass visibility via system admin/viewing-as', async role => {
    const f = fixture(true); f.state.memberRole = role;
    f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, '隐私类别1__visible': 0 });
    expect((await f.read({ ...input, systemRole: 'admin', isViewingAs: true })).closedTrades).toEqual([]);
    expect(f.log).toHaveLength(4);
  });
  it('default hidden actual category stays hidden until explicitly allowed; original owner exemption remains', async () => {
    const f = fixture(true); f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, __tagVisibilityDefault: 0 });
    expect((await f.read(input)).closedTrades).toEqual([]);
    f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, __tagVisibilityDefault: 0, '隐私类别1__visible': 1 });
    expect((await f.read(input)).closedTrades).toHaveLength(1);
    f.state.memberRole = 'owner'; f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, '隐私类别1__visible': 0 });
    expect((await f.read(input)).closedTrades).toHaveLength(1);
  });
  it('actual category nonmember/invalid stock category/malformed settings fail rather than become empty', async () => {
    const f = fixture(true); f.state.categoryPatch = { parentId: 9 };
    await expect(f.read(input)).rejects.toThrow('不是股票持仓模式');
    f.state.categoryPatch = { member_user_id: null };
    await expect(f.read({ ...input, systemRole: 'admin' })).rejects.toThrow('不是此账本的成员');
    f.state.categoryPatch = { initialBalances: '{bad' };
    await expect(f.read(input)).rejects.toThrow('JSON损坏');
  });
});
