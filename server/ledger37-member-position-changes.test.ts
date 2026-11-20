import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { normalizePortfolioSymbol } from '../shared/portfolio-instruments';
import { isLedger37FullManager, canRecordLedger37Calendar } from '../shared/ledger37-permissions';
import { readTagVisible } from '../shared/tag-visibility';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';
import { replaceTopLevelJsonValue } from './r1-lossless-json';

// Execute the actual production functions, not a rewritten algorithm. No import
// of db, dotenv, startup, scanners, network clients or transaction connections.
function extract(filename: string, names: string[]) {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
  expect(functions).toHaveLength(names.length);
  return functions.map(node => node.getText(tree).replace(/^export /, '')).join('\n');
}
const body = extract('./ledger-stock-portfolio.ts', ['stockObservationTableExists', 'getMyLedger37MemberPositionChanges']);
const permissionBody = extract('./ledger37-ai-presentation.ts', [
  'readLedger37Balances', 'readLedger37AiEnabled', 'validateInput',
  'isLedger37AiSystemAdmin', 'readLedger37AiViewer', 'readLedger37PresentationState',
]) + '\n' + extract('./r1-stock-presentation.ts', [
  'readR1Balances', 'readR1AiEnabled', 'validateScope', 'systemAdmin', 'readR1StockPresentationState',
]);
const input = { ledgerId: 37, userId: 201 };
const today = '2026-11-19';
function event(patch: Record<string, unknown> = {}) {
  return { category_id: 1, ledger_id: 37, user_id: 201, symbol: '600000.SH', stock_name: '浦发银行',
    action: 'new', event_quantity: '10.00000000', allocated_quantity: '10.00000000', remaining_quantity: '10.00000000',
    start_date: '2026-11-01', opened_at: '2026-11-01 10:00:00', event_at: '2026-11-02 10:00:00',
    event_order_id: '44', event_id: '44', participation_id: '44',
    opening_status: 'active', opening_type: 'buy', sale_status: 'active', sale_type: 'sell',
    sale_quantity: '10', allocation_quantity: '10', category_valid: true,
    has_participation: true, matching_lot: true, matching_opening: true, matching_sale: true, matching_allocation: true,
    observation_enabled: false,
    // Deliberately include extra private fields in driver rows: output must whitelist.
    updated_at: '2026-11-19 23:59:59', created_at: '2026-11-19 23:59:59', assigned_by: 999,
    closed_at: '2026-11-19 23:59:59', sale_price: '999', pnl: '888', lot_id: 22, sell_event_id: 33,
    projectName: 'SECRET', viewer_username: 'SECRET', ...patch };
}
function decrease(patch: Record<string, unknown> = {}) {
  return event({ action: 'decrease', event_at: '2026-11-18 14:00:00', event_order_id: '33', event_id: '55', ...patch });
}
function fixture(realPermissions = false) {
  const state = { ledgerId: 37, ownerId: 100, viewerUserId: 201, viewer: { userId: 201 } as any,
    member: true, canManage: false, aiEnabled: true, memberRole: 'member', duplicateMember: false,
    balances: JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1 }), denied: new Set<number>(),
    categoryPatch: {} as any, identityPatch: {} as any, categoryError: null as any,
    observationTableExists: true, readError: null as any, noConnection: false,
    duplicateCategories: false, injectRows: null as any[] | null };
  const data = { rows: [event()] as any[] };
  const log: Array<{ sql: string; values: any[] }> = [];
  // Malformed quantities survive the mock SQL filter to test strict driver-row
  // validation. Valid decimal zero/negative are excluded by the real SQL > 0.
  const positive = (value: unknown) => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
    ? !value.startsWith('-') && /[1-9]/.test(value) : true;
  const effective = (userId: number) => data.rows.filter(row => row.ledger_id === 37 && row.user_id === userId
    && row.has_participation && row.matching_lot && row.matching_opening && row.category_valid
    && row.opening_status === 'active' && ['buy', 'add'].includes(row.opening_type)
    && positive(row.allocated_quantity)
    && (row.start_date || row.opened_at?.slice(0, 10)) != null
    && (row.start_date || row.opened_at?.slice(0, 10)) <= today
    && !(state.observationTableExists && row.observation_enabled)
    && (row.action !== 'decrease' || (row.matching_sale && row.matching_allocation
      && row.sale_status === 'active' && ['reduce', 'sell'].includes(row.sale_type)
      && positive(row.event_quantity) && positive(row.sale_quantity) && positive(row.allocation_quantity))));
  const conn = { execute: vi.fn(async (sql: string, values: any[] = []) => {
    log.push({ sql, values });
    if (!/^\s*SELECT\b/.test(sql) || /FOR UPDATE|GET_LOCK/i.test(sql)) throw new Error('Offline fixture permits SELECT only');
    if (/FROM ledgers l LEFT JOIN ledger_members/.test(sql)) {
      const row = { ledger_id: state.ledgerId, ledger_owner_id: state.ownerId,
        member_user_id: state.member ? values[0] : null, member_role: state.memberRole,
        initialBalances: state.balances, viewer_user_id: state.viewer ? state.viewer.userId : null,
        viewer_username: 'SECRET' };
      return [state.duplicateMember ? [row, { ...row }] : [row]];
    }
    if (/FROM ledger_categories c\s+LEFT JOIN ledger_members/.test(sql)) return [[{
      id: values[1], ledgerId: 37, ledger_owner_id: state.ownerId, name: `隐私类别${values[1]}`,
      parentId: null, accounting_mode: 'stock_portfolio', member_user_id: state.member ? values[0] : null,
      member_role: state.memberRole, initialBalances: state.balances, ...state.categoryPatch,
    }]];
    if (/FROM information_schema.tables/.test(sql)) return [state.observationTableExists ? [{ TABLE_NAME: 'ledger_stock_lot_observations' }] : []];
    if (/FROM ledger_stock_lot_participations p/.test(sql)) {
      if (state.readError) throw state.readError;
      expect(values.slice(0, 3)).toEqual([37, expect.any(Number), today]);
      const rows = effective(values[1]);
      if (/SELECT DISTINCT p.category_id/.test(sql)) {
        const categories = Array.from(new Set(rows.map(row => row.category_id))).map(id => ({ id }));
        return [state.duplicateCategories ? categories.concat(categories) : categories];
      }
      expect(sql).toContain('UNION ALL');
      const half = values.length / 2;
      expect(values.slice(0, half)).toEqual(values.slice(half));
      expect(sql.match(/AND p.category_id IN \(/g)).toHaveLength(2);
      return [state.injectRows || rows.filter(row => values.slice(3, half).includes(row.category_id))];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }) };
  const auth = vi.fn(async () => ({ isMember: state.member, context: {
    ledgerId: state.ledgerId, viewerUserId: state.viewerUserId, viewer: state.viewer,
    aiEnabled: state.aiEnabled, canManage: state.canManage,
  } }));
  const categoryAuth = vi.fn(async (request: any, connection: any) => {
    expect(connection).toBe(conn);
    if (state.categoryError) throw state.categoryError;
    if (state.denied.has(request.categoryId)) throw new Error('您无权查看此标签');
    return { isMember: state.member, context: { ledgerId: 37, categoryId: request.categoryId,
      viewerUserId: request.userId, aiEnabled: state.aiEnabled, canManage: state.canManage, ...state.identityPatch } };
  });
  const db = vi.fn(async () => state.noConnection ? null : conn);
  const code = ts.transpileModule((realPermissions ? permissionBody + '\n' : '') + body + '\ngetMyLedger37MemberPositionChanges;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const read = runInNewContext(code, { Error, Number, JSON, Array, Date, Intl, Map, Set,
    readLedger37PresentationState: auth, readR1StockPresentationState: categoryAuth, getDbConnection: db,
    normalizeSymbol: normalizePortfolioSymbol, beijingDate: () => today,
    readTagVisible, isLedger37FullManager, canRecordLedger37Calendar, LEDGER37_AI_DISPLAY_KEY,
    replaceTopLevelJsonValue, R1_STOCK_LEDGER_ID: 37,
  }, { timeout: 1000 }) as (request: any) => Promise<any>;
  return { state, data, log, conn, db, auth, categoryAuth, read };
}
function safe(result: any) {
  expect(Object.keys(result).sort()).toEqual(['aiEnabled', 'positionChanges', 'viewerUserId']);
  for (const row of result.positionChanges) expect(Object.keys(row).sort()).toEqual(['action', 'stockName', 'symbol']);
  expect(JSON.stringify(result)).not.toMatch(/SECRET|category|participation|lot_id|sell_event|user_id|price|pnl|quantity|allocated|remaining|assigned|created|updated|date|event_id/i);
}

describe('member position changes: actual TS functions in offline SELECT-only VM', () => {
  it('current real allocation with no closure produces new and exactly the safe projection', async () => {
    const f = fixture(); const result = await f.read(input); safe(result);
    expect(result.positionChanges).toEqual([{ symbol: '600000.SH', stockName: '浦发银行', action: 'new' }]);
    expect(f.categoryAuth).toHaveBeenCalledTimes(1);
    expect(f.categoryAuth.mock.invocationCallOrder[0]).toBeLessThan(f.conn.execute.mock.invocationCallOrder[2]);
  });
  it('all-closed allocation retains the original new and each partial closure without merging', async () => {
    const f = fixture(); f.data.rows = [event({ remaining_quantity: '0' }), decrease({ remaining_quantity: '0' }),
      decrease({ remaining_quantity: '0', event_id: '56', event_quantity: '5' })];
    const result = await f.read(input); safe(result);
    expect(result.positionChanges.map((row: any) => row.action)).toEqual(['decrease', 'decrease', 'new']);
    expect(body).not.toContain('p.remaining_quantity');
  });
  it('same-symbol cross-category lots are each new, never fabricated increase or symbol deduplication', async () => {
    const f = fixture(); f.data.rows.push(event({ category_id: 2, participation_id: '45', event_id: '45', event_order_id: '45' }));
    expect((await f.read(input)).positionChanges.map((row: any) => row.action)).toEqual(['new', 'new']);
    expect(f.categoryAuth).toHaveBeenCalledTimes(2);
  });
  it('interleaves assignment and sale actual times, not mutable updates or global opening time', async () => {
    const f = fixture(); f.data.rows = [event({ symbol: 'MSFT', stock_name: '微软', event_at: '2026-11-19 09:00:00' }),
      event({ symbol: 'NVDA', stock_name: '英伟达', event_at: '2026-11-01 09:00:00' }), decrease()];
    expect((await f.read(input)).positionChanges.map((row: any) => [row.symbol, row.action])).toEqual([
      ['MSFT', 'new'], ['600000.SH', 'decrease'], ['NVDA', 'new'],
    ]);
    expect(body).not.toMatch(/p\.updated_at|opening\.actual_traded_at|c\.closed_at|created_at/);
  });
  it('assignment fallback uses start date then lot opened time; no today evidence fallback', async () => {
    const f = fixture(); f.data.rows = [event({ symbol: 'MSFT', event_at: null, start_date: '2026-11-05' }),
      event({ symbol: 'NVDA', event_at: null, start_date: null, opened_at: '2026-11-02 10:00:00' }),
      decrease({ event_at: '2026-11-03 14:00:00' }), event({ start_date: null, opened_at: null, event_at: null })];
    expect((await f.read(input)).positionChanges.map((row: any) => row.symbol)).toEqual(['MSFT', '600000.SH', 'NVDA']);
    expect(body).toContain('COALESCE(p.start_date, DATE(l.opened_at)) <= ?');
    expect(body).not.toContain('DATE(l.opened_at), ?');
  });
  it('unknown sale times sort last deterministically by exact BIGINT IDs, independent of row order', async () => {
    const f = fixture(); f.data.rows = [decrease({ symbol: 'MSFT', event_at: null, event_order_id: '9007199254740992' }),
      event(), decrease({ symbol: 'NVDA', event_at: null, event_order_id: '9007199254740993' })];
    const a = await f.read(input); f.data.rows.reverse(); const b = await f.read(input);
    expect(a).toEqual(b); safe(a);
    expect(a.positionChanges.map((row: any) => row.symbol)).toEqual(['600000.SH', 'NVDA', 'MSFT']);
  });
  it('equal actual times use deterministic action/category/event/participation evidence keys', async () => {
    const f = fixture(); f.data.rows = [event(), decrease({ event_at: '2026-11-02 10:00:00', symbol: 'MSFT' }),
      decrease({ event_at: '2026-11-02 10:00:00', symbol: 'NVDA', event_id: '56' })];
    const a = await f.read(input); f.data.rows.reverse(); expect(await f.read(input)).toEqual(a);
    expect(a.positionChanges.map((row: any) => row.symbol)).toEqual(['NVDA', 'MSFT', '600000.SH']);
  });
  it('Beijing wall clock, explicit offsets and Date objects share the same timeline', async () => {
    const f = fixture(); f.data.rows = [event({ event_at: '2026-11-18 10:00:00' }),
      decrease({ symbol: 'MSFT', event_at: '2026-11-18T03:00:00Z' }),
      decrease({ symbol: 'NVDA', event_at: new Date('2026-11-18T04:00:00Z') })];
    expect((await f.read(input)).positionChanges.map((row: any) => row.symbol)).toEqual(['NVDA', 'MSFT', '600000.SH']);
  });
  it('invalid sale dates remain unknown, never use registration/today dates', async () => {
    for (const value of ['2026-02-30 10:00:00', '2026-11-18 25:00:00', '0000-00-00', '', 'garbage', '2026-11-18T01:60:00Z']) {
      const f = fixture(); f.data.rows = [decrease({ event_at: value }), event()];
      expect((await f.read(input)).positionChanges.map((row: any) => row.action)).toEqual(['new', 'decrease']);
    }
  });
  it('enabled observation excludes both allocation and closure, absent optional table stays SELECT-only', async () => {
    const f = fixture(); f.data.rows = [event({ observation_enabled: true }), decrease({ observation_enabled: true })];
    expect((await f.read(input)).positionChanges).toEqual([]); expect(f.categoryAuth).not.toHaveBeenCalled();
    f.state.observationTableExists = false; expect((await f.read(input)).positionChanges).toHaveLength(2);
    expect(body).toContain('o.ledger_id=p.ledger_id AND o.category_id=p.category_id');
    expect(body).toContain('o.lot_id=p.lot_id AND o.user_id=p.user_id AND o.enabled=1');
  });
  it('future-start, nonparticipant, wrong member/ledger and invalid source opening/category never export', async () => {
    const f = fixture(); f.data.rows = [event(), event({ start_date: '2099-01-01' }), event({ has_participation: false }),
      event({ user_id: 202, symbol: 'MSFT' }), event({ ledger_id: 52 }), event({ category_valid: false }),
      event({ matching_lot: false }), event({ matching_opening: false }), event({ opening_status: 'voided' }), event({ opening_type: 'note' })];
    expect((await f.read(input)).positionChanges).toHaveLength(1);
    expect(body).toContain('opening.symbol=l.symbol');
    expect(body).toContain("category.parentId IS NULL AND category.accounting_mode='stock_portfolio'");
  });
  it('source-wide sale is insufficient: strict participation/sale/lot allocation and positive sale/closure required', async () => {
    const f = fixture(); f.data.rows = [decrease(), decrease({ matching_sale: false }), decrease({ matching_allocation: false }),
      decrease({ sale_status: 'voided' }), decrease({ sale_type: 'note' }), decrease({ event_quantity: '0' }),
      decrease({ sale_quantity: '0' }), decrease({ allocation_quantity: '-1' })];
    expect((await f.read(input)).positionChanges).toHaveLength(1);
    expect(body).toContain('c.participation_id=p.id AND c.quantity>0');
    expect(body).toContain('sale.id=c.sell_event_id');
    expect(body).toContain('sale.ledger_id=p.ledger_id AND sale.category_id=p.category_id');
    expect(body).toContain('a.event_id=c.sell_event_id AND a.lot_id=l.id AND a.quantity>0');
  });
  it('strict positive exact 18dp values preserve sub-epsilon and unsafe-integer-sized evidence', async () => {
    const f = fixture(); f.data.rows = [event({ event_quantity: '0.000000000000000001' }),
      decrease({ event_quantity: '9007199254740993.123456789012345678' })];
    expect((await f.read(input)).positionChanges).toHaveLength(2);
    expect(body).not.toMatch(/parseFloat|Number\(row.event_quantity\)|EPSILON/);
    expect(body).toContain('CAST(p.allocated_quantity AS CHAR)'); expect(body).toContain('CAST(c.quantity AS CHAR)');
  });
  it('zero and negative event evidence excluded defensively; zero allocation is not an original new', async () => {
    const f = fixture(); f.state.injectRows = ['0', '0.000000000000000000', '-1', '-0.00000001'].map(event_quantity => event({ event_quantity }));
    expect((await f.read(input)).positionChanges).toEqual([]);
    f.state.injectRows = null; f.data.rows = [event({ allocated_quantity: '0' }), decrease({ allocated_quantity: '-1' })];
    expect((await f.read(input)).positionChanges).toEqual([]);
  });
  it('malformed/lossy quantity driver data fails closed', async () => {
    for (const value of [null, 1, '', 'NaN', '1e-18', '0.0000000000000000001', '1.2.3', ' 1', '+1']) {
      const f = fixture(); f.data.rows = [event({ event_quantity: value })];
      await expect(f.read(input)).rejects.toThrow('数量不可用');
    }
  });
  it('detail rows cannot escape approved category/member/ledger scope or invent actions/evidence IDs', async () => {
    for (const patch of [{ category_id: 2 }, { user_id: 202 }, { ledger_id: 52 }, { action: 'increase' },
      { event_id: 'bad' }, { participation_id: 9007199254740993 }, { stock_name: '' }]) {
      const f = fixture(); f.state.injectRows = [event(patch)]; await expect(f.read(input)).rejects.toThrow();
    }
    const f = fixture(); f.state.injectRows = [event({ start_date: '2099-01-01' }), event({ start_date: '2026-02-30' })];
    expect((await f.read(input)).positionChanges).toEqual([]);
  });
  it('hidden category removed before detail and duplicate allowed category authorizes once', async () => {
    const f = fixture(); f.data.rows.push(event({ category_id: 2 })); f.state.denied.add(2); f.state.duplicateCategories = true;
    expect((await f.read(input)).positionChanges).toHaveLength(1);
    const query = f.log.at(-1)!; expect(query.values).toEqual([37, 201, today, 1, 37, 201, today, 1]);
    expect(f.categoryAuth.mock.calls.filter(([request]) => request.categoryId === 1)).toHaveLength(1);
    f.state.denied.add(1); f.log.length = 0; expect((await f.read(input)).positionChanges).toEqual([]);
    expect(f.log).toHaveLength(2);
  });
  it('global member/target profile/AI identity checks fail before DB metadata/details', async () => {
    for (const patch of [{ member: false }, { viewer: null }, { viewer: { userId: 999 } }, { viewerUserId: 999 }, { ledgerId: 52 }, { aiEnabled: false }]) {
      const f = fixture(); Object.assign(f.state, patch); await expect(f.read(input)).rejects.toThrow();
      expect(f.db).not.toHaveBeenCalled(); expect(f.log).toEqual([]);
    }
  });
  it('AI-off real owner preview only, no nonowner system-admin or viewing-as bypass', async () => {
    const f = fixture(); f.state.aiEnabled = false;
    await expect(f.read({ ...input, systemRole: 'admin' })).rejects.toThrow('尚未开启');
    f.state.canManage = true; expect((await f.read(input)).aiEnabled).toBe(false); f.log.length = 0;
    await expect(f.read({ ...input, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('尚未开启');
    expect(f.log).toEqual([]);
  });
  it('viewing-as selects only effective target user and reauthorizes each request', async () => {
    const f = fixture(); f.data.rows.push(event({ user_id: 202, symbol: 'MSFT' }));
    expect((await f.read(input)).positionChanges[0].symbol).toBe('600000.SH');
    f.state.viewer = { userId: 202 }; f.state.viewerUserId = 202;
    expect((await f.read({ ...input, userId: 202, isViewingAs: true, systemRole: 'admin' })).positionChanges[0].symbol).toBe('MSFT');
    expect(f.auth).toHaveBeenCalledTimes(2);
  });
  it('changed category identity/global AI fails before details; infrastructure errors are not empty results', async () => {
    for (const patch of [{ viewerUserId: 999 }, { categoryId: 999 }, { ledgerId: 52 }, { aiEnabled: false }]) {
      const f = fixture(); f.state.identityPatch = patch; await expect(f.read(input)).rejects.toThrow(); expect(f.log).toHaveLength(2);
    }
    const f = fixture(); f.state.categoryError = new Error('category unavailable'); await expect(f.read(input)).rejects.toThrow('category unavailable');
    f.state.categoryError = null; f.state.readError = new Error('evidence unavailable'); await expect(f.read(input)).rejects.toThrow('evidence unavailable');
    f.state.readError = null; f.state.noConnection = true; await expect(f.read(input)).rejects.toThrow('数据库连接不可用');
  });
  it('full history is not limited to 20 and needs no valuation, market/FX, cache, mutation or DDL', async () => {
    const f = fixture(); f.data.rows = Array.from({ length: 65 }, (_, i) => decrease({ event_id: String(i + 1) }));
    const result = await f.read(input); safe(result); expect(result.positionChanges).toHaveLength(65);
    expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
    expect(f.log.at(-1)!.sql).not.toMatch(/LIMIT|GROUP BY|MAX\(/i);
    const executable = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2020, removeComments: true } }).outputText;
    expect(executable).not.toMatch(/ensure\w+|fetch\w+|getCached|readShortLivedCache|getMyLedger37R1HoldingSnapshot|INSERT|UPDATE|CREATE|ALTER|DELETE|FOR UPDATE|getDbTransactionConnection|beginTransaction|quote|usd_cny|snapshot/i);
    const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES5 }, reportDiagnostics: true });
    expect(compiled.diagnostics?.filter(row => row.category === ts.DiagnosticCategory.Error)).toEqual([]);
  });
});

describe('member changes using actual global/category SELECT permissions offline', () => {
  it('executes actual member/AI/visibility authorization; duplicate member rows fail closed', async () => {
    const f = fixture(true); const result = await f.read(input); safe(result); expect(result.positionChanges).toHaveLength(1);
    expect(f.log[0].sql).toContain('FROM ledgers');
    expect(f.log.some(row => /FROM ledger_categories c/.test(row.sql))).toBe(true);
    f.state.duplicateMember = true; await expect(f.read(input)).rejects.toThrow('账本不存在');
  });
  it('actual member/admin hidden tag and default visibility are honored in viewing-as', async () => {
    for (const role of ['member', 'admin']) {
      const f = fixture(true); f.state.memberRole = role;
      f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, '隐私类别1__visible': 0 });
      expect((await f.read({ ...input, systemRole: 'admin', isViewingAs: true })).positionChanges).toEqual([]);
      f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, __tagVisibilityDefault: 0 });
      expect((await f.read(input)).positionChanges).toEqual([]);
      f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, __tagVisibilityDefault: 0, '隐私类别1__visible': 1 });
      expect((await f.read(input)).positionChanges).toHaveLength(1);
    }
  });
  it('actual nonowner administrator cannot preview AI-off, owner can but not in viewing-as', async () => {
    const f = fixture(true); f.state.balances = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 0 });
    await expect(f.read({ ...input, systemRole: 'admin' })).rejects.toThrow('尚未开启');
    f.state.ownerId = input.userId; expect((await f.read(input)).aiEnabled).toBe(false);
    await expect(f.read({ ...input, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('尚未开启');
  });
  it('actual invalid category, category nonmember and malformed/duplicate AI settings fail closed', async () => {
    const f = fixture(true); f.state.categoryPatch = { parentId: 9 }; await expect(f.read(input)).rejects.toThrow('不是股票持仓模式');
    f.state.categoryPatch = { member_user_id: null }; await expect(f.read({ ...input, systemRole: 'admin' })).rejects.toThrow('不是此账本的成员');
    f.state.categoryPatch = { initialBalances: '{bad' }; await expect(f.read(input)).rejects.toThrow('JSON损坏');
    f.state.categoryPatch = {}; f.state.balances = `{"${LEDGER37_AI_DISPLAY_KEY}":1,"${LEDGER37_AI_DISPLAY_KEY}":0}`;
    await expect(f.read(input)).rejects.toThrow();
  });
});
