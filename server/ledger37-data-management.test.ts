import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';
import type { UserTagDownsideOverride } from '../shared/user-tag-downside-override';
// The imported builder's module also exports old DB adapters. Prevent their import graph from
// loading the whole backend or touching DB; execute the REAL pure builder and display helpers.
vi.mock('./db', () => ({ getDbConnection: () => { throw new Error('DB forbidden'); } }));
import { dataManagementSchema, readLedger37DataManagement } from './ledger37-data-management';
import { buildOrdinaryTagDownsideValuation } from './ordinary-tag-downside-valuation';
const OWNER = { user: { id: 1 } };
const TODAY = '2026-11-26';
const PRIVATE = { 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02', secret: 'NEVER_OUTPUT' };
const RULE: OrdinaryTagDownsideRule = { ledgerId: 37, categoryId: 10, userId: 1, version: 1,
  enabled: true, thresholdAmount: 1000, downsidePercent: 30, startDate: '2026-11-02', createdAt: '2026-11-01T01:00:00.000Z' };
function cat(id = 10, name = '普通', accountingMode = 'manual_balance', parentId: number | null = null) {
  return { id, ledgerId: 37, name, accountingMode, parentId, isDefault: 0, type: 'income' };
}
function member(userId = 3, balances: any = PRIVATE, extra: any = {}) {
  return { ledgerId: 37, userId, memberType: 'real', username: `user${userId}`, name: `姓名${userId}`, nickname: `成员${userId}`,
    avatar: null, initialBalances: JSON.stringify(balances), permissionView: 'all', ...extra };
}
function record(date: string, amount: any, extra: any = {}) {
  return { ledgerId: 37, categoryId: 10, createdBy: 3, type: 'income', amount, recordDate: date,
    recordId: 1, createdAt: `${date} 01:00:00.000000`, deletedAt: null, description: null, ...extra };
}
function fixture() {
  const f = {
    actor: { ledgerId: 37, ownerId: 1, memberUserId: 1, memberRole: 'owner', memberType: 'real', realAdminCount: 1 },
    actors: null as any[] | null,
    members: [member()], categories: [cat()],
    records: [record('2026-11-25', 900), record(TODAY, 800)],
    rules: new Map<number, OrdinaryTagDownsideRule[]>(), overrides: [] as UserTagDownsideOverride[],
    stock: [] as any[], stockStarts: [] as any[],
  };
  const connection = { execute: vi.fn(async (sql: string, _values: any[]) => {
    if (!/^SELECT\b/.test(sql.trim()) || /\b(UPDATE|INSERT|CREATE|DELETE)\b/.test(sql)) throw new Error('not SELECT');
    if (sql.includes('FROM ledgers l')) return [f.actors ?? [f.actor]];
    if (sql.includes('FROM ledger_members m')) return [f.members];
    if (sql.includes('FROM ledger_categories')) return [f.categories];
    if (sql.includes('FROM ledger_records r')) return [f.records];
    if (sql.includes('FROM ledger_stock_lot_participations p')) return [f.stockStarts];
    throw new Error('unexpected query');
  }) };
  const deps = { connection, loadStockOverview: vi.fn(async (_userId: number) => f.stock),
    readOrdinaryRules: vi.fn(async (_connection: any) => f.rules), readOverrides: vi.fn(async (_connection: any) => f.overrides) };
  const read = (input: any = { ledgerId: 37, targetUserId: 3 }, ctx: any = OWNER) => readLedger37DataManagement(ctx, input, deps);
  return { f, deps, read };
}
function stockRow(categoryId = 20, extra: any = {}) {
  return { categoryId, name: '股票项目20', startDate: '2026-11-02', startDateVerified: true,
    summary: { totalPnl: 90000, confirmedTotalPnl: 120, confirmedAsOf: '2026-11-25', expectedDate: TODAY },
    points: [{ date: '2026-11-25', totalPnl: 120, dailyPnl: 20, ready: true },
      { date: TODAY, totalPnl: null, dailyPnl: null, ready: false }], ...extra };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${TODAY}T16:00:00+08:00`)); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('ledger37 independent READ authorization and strict input', () => {
  it('actual owner reads and alone canEdit; minimal member DTO omits private identity/config/rules', async () => {
    const h = fixture(), data = await h.read();
    expect(data.canEdit).toBe(true); expect(data.ledgerId).toBe(37);
    expect(data.page).toBe(1); expect(data.pageSize).toBe(1);
    expect(data.members[0].username).toBe('user3');
    const json = JSON.stringify(data);
    for (const key of ['NEVER_OUTPUT', 'initialBalances', 'permissionView', 'memberType', 'thresholdAmount', 'downsidePercent', 'ruleVersion', 'createdBy']) expect(json).not.toContain(key);
    const sql = h.deps.connection.execute.mock.calls.map(c => c[0]).join('\n');
    expect(sql).toContain("m.member_type = 'real'"); expect(sql).toContain('INNER JOIN users');
    expect(sql).not.toContain('SELECT *');
  });
  it('the unique actor real membership reads even with multiple other admins, but cannot edit', async () => {
    const h = fixture(); h.f.actor = { ...h.f.actor, memberUserId: 2, memberRole: 'admin' };
    h.f.actor.realAdminCount = 3;
    h.f.members.push(member(5, PRIVATE, { memberRole: 'admin' }), member(6, PRIVATE, { memberRole: 'admin' }));
    expect((await h.read(undefined, { user: { id: 2, role: 'parent' } })).canEdit).toBe(false);
  });
  it.each([
    ['ordinary member', { memberRole: 'member' }, { user: { id: 1 } }],
    ['forged member owner', { ownerId: 9, memberRole: 'owner' }, { user: { id: 1 } }],
    ['system admin only', { ownerId: 9, memberRole: 'member' }, { user: { id: 1, role: 'super_admin' } }],
    ['AI admin', { ownerId: 9, memberRole: 'admin', memberType: 'ai' }, { user: { id: 1 } }],
    ['wrong ledger row', { ledgerId: 38 }, { user: { id: 1 } }],
    ['isViewingAs', {}, { user: { id: 1 }, isViewingAs: true }],
    ['different realUser', {}, { user: { id: 1 }, realUser: { id: 9 } }],
  ])('rejects %s before member/history/stock loading', async (kind, patch, ctx) => {
    const h = fixture(); h.f.actor = { ...h.f.actor, ...patch };
    if (kind === 'ordinary member') h.f.actor.ownerId = 9;
    await expect(h.read(undefined, ctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.deps.loadStockOverview).not.toHaveBeenCalled(); expect(h.deps.readOrdinaryRules).not.toHaveBeenCalled();
    expect(h.deps.connection.execute.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it('same realUser is permitted, duplicate auth rows are not', async () => {
    const h = fixture(); expect((await h.read(undefined, { user: { id: 1 }, realUser: { id: 1 } })).canEdit).toBe(true);
    h.f.actors = [h.f.actor, h.f.actor]; await expect(h.read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each([{ ledgerId: 38 }, { ledgerId: '37' }, { ledgerId: 37, extra: true }, { ledgerId: 37, page: 0 },
    { ledgerId: 37, pageSize: 21 }, { ledgerId: 37, keyword: 'x'.repeat(81) }, { ledgerId: 37, targetUserId: 0 },
    { ledgerId: 37, targetUserId: 3.5 }])('strict invalid input causes no I/O: %j', async input => {
    const h = fixture(); await expect(h.read(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(h.deps.connection.execute).not.toHaveBeenCalled();
  });
  it('defaults are page 1 size 10 empty keyword; target must be a real member', async () => {
    expect(dataManagementSchema.parse({ ledgerId: 37 })).toEqual({ ledgerId: 37, page: 1, pageSize: 10, keyword: '' });
    const h = fixture(); await expect(h.read({ ledgerId: 37, targetUserId: 8 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.deps.readOrdinaryRules).not.toHaveBeenCalled();
  });
  it.each(['duplicate members', 'non-real members', 'foreign member', 'duplicate category', 'foreign category', 'missing parent', 'cyclic category', 'duplicate root name'])('%s fails closed', async kind => {
    const h = fixture();
    if (kind === 'duplicate members') h.f.members.push(member());
    if (kind === 'non-real members') h.f.members[0].memberType = 'ai';
    if (kind === 'foreign member') h.f.members[0].ledgerId = 38;
    if (kind === 'duplicate category') h.f.categories.push(cat());
    if (kind === 'foreign category') h.f.categories[0].ledgerId = 38;
    if (kind === 'missing parent') h.f.categories.push(cat(11, '子', 'manual_balance', 999));
    if (kind === 'cyclic category') h.f.categories.push(cat(11, '子', 'manual_balance', 11));
    if (kind === 'duplicate root name') h.f.categories.push(cat(12));
    await expect(h.read()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(h.deps.loadStockOverview).not.toHaveBeenCalled();
  });
});
describe('page-first work, whole-history sharing and concurrency', () => {
  it('allMembers returns every matching member on one page without the old page-size cap', async () => {
    const h = fixture(); h.f.members = Array.from({ length: 35 }, (_, i) => member(i + 3));
    const data = await h.read({ ledgerId: 37, allMembers: true, page: 99, pageSize: 1 });
    expect(data.members).toHaveLength(35); expect(data.totalMembers).toBe(35);
    expect(data.page).toBe(1); expect(data.pageSize).toBe(35);
    expect(data.members.every(m => m.tags.every(t => t.points.length === 0))).toBe(true);
  });
  it('only default ten page members load stock, concurrency is exactly at most two, list points empty', async () => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')];
    h.f.members = Array.from({ length: 35 }, (_, i) => member(i + 3));
    let active = 0, peak = 0;
    h.deps.loadStockOverview.mockImplementation(async () => {
      active++; peak = Math.max(peak, active); await Promise.resolve(); await Promise.resolve(); active--;
      return [stockRow()];
    });
    const data = await h.read({ ledgerId: 37 });
    expect(data.totalMembers).toBe(35); expect(data.members).toHaveLength(10);
    expect(h.deps.loadStockOverview).toHaveBeenCalledTimes(10); expect(peak).toBe(2);
    expect(h.deps.loadStockOverview.mock.calls.map(c => c[0])).toEqual([3,4,5,6,7,8,9,10,11,12]);
    expect(data.members.every(m => m.tags.every(t => t.points.length === 0))).toBe(true);
    expect(h.deps.readOrdinaryRules).toHaveBeenCalledTimes(1); expect(h.deps.readOverrides).toHaveBeenCalledTimes(1);
    const recordSql = h.deps.connection.execute.mock.calls.filter(c => c[0].includes('FROM ledger_records r'));
    expect(recordSql).toHaveLength(1); expect(recordSql[0][0]).not.toMatch(/\bLIMIT\b/i);
    expect(recordSql[0][0]).not.toMatch(/\bORDER BY\b/i);
    expect(recordSql[0][0]).toContain('r.createdBy');
  });
  it('keyword before pagination; empty page produces no valuations', async () => {
    const h = fixture(); h.f.members = [member(3), member(4), member(5)];
    h.f.categories = [cat(20, 'R1', 'stock_portfolio')]; h.f.stock = [stockRow()];
    const data = await h.read({ ledgerId: 37, keyword: ' USER4 ', pageSize: 1 });
    expect(data.totalMembers).toBe(1); expect(data.members[0].userId).toBe(4);
    expect(h.deps.loadStockOverview).toHaveBeenCalledTimes(1); expect(h.deps.loadStockOverview).toHaveBeenCalledWith(4);
    h.deps.loadStockOverview.mockClear();
    const empty = await h.read({ ledgerId: 37, page: 100 }); expect(empty.members).toEqual([]);
    expect(h.deps.loadStockOverview).not.toHaveBeenCalled();
  });
  it('reads more than 100/200 old rows and preserves pre-entry cashflow evidence', async () => {
    const h = fixture(); h.f.records = Array.from({ length: 250 }, (_, i) => record('2026-10-30', 1,
      { type: 'transfer', description: 'capital_add', recordId: i + 1 }));
    h.f.records.push(record('2026-11-25', 1000));
    const data = await h.read(); expect(data.members[0].totalPnl).toBe(125);
    expect(data.members[0].tags[0].points).toHaveLength(1);
  });
});
describe('ordinary legacy AA formula and pause/member semantics', () => {
  it('income takes priority over same-day expense; cumulative and daily use the legacy formulas', async () => {
    const h = fixture(); h.f.records.push(record(TODAY, 50), record(TODAY, 777, { type: 'expense' }),
      record(TODAY, 200, { type: 'transfer', description: 'capital_add' }),
      record(TODAY, 30, { type: 'transfer', description: 'capital_sub' }),
      record(TODAY, 20, { type: 'transfer', description: 'withdraw' }));
    const m = (await h.read()).members[0], tag = m.tags[0];
    expect(tag.totalPnl).toBe(150); expect(tag.dailyPnl).toBe(100);
    expect(tag.points[0]).toEqual({ date: '2026-11-25', totalPnl: 50, dailyPnl: 25 });
    expect(tag.notice).toContain('首页'); expect(tag.notice).not.toContain('比例'); expect(m.startDate).toBe('2026-11-02');
  });
  it('first point uses ratio twice in daily fallback, absent daily ratio remains old zero only for verified data', async () => {
    const h = fixture(); h.f.records = [record(TODAY, 800)];
    let tag = (await h.read()).members[0].tags[0]; expect(tag.totalPnl).toBe(100); expect(tag.dailyPnl).toBe(50);
    h.f.members = [member(3, { 普通: 1000, 普通__startDate: '2026-11-02' })];
    tag = (await h.read()).members[0].tags[0]; expect(tag.totalPnl).toBe(200); expect(tag.dailyPnl).toBe(0);
  });
  it('includes exact start-before-A-session baseline but not earlier balance days; pre-entry flows retained', async () => {
    const h = fixture(); h.f.members = [member(3, { ...PRIVATE, 普通__startDate: '2026-05-06' })];
    h.f.records = [record('2026-04-29', 500), record('2026-04-29', 100, { type: 'transfer', description: 'capital_add' }),
      record('2026-04-30', 1000), record('2026-05-06', 900)];
    const tag = (await h.read()).members[0].tags[0];
    expect(tag.points.map(p => p.date)).toEqual(['2026-04-30', '2026-05-06']);
    expect(tag.points.map(p => p.totalPnl)).toEqual([50, 100]);
    expect(tag.points[1].dailyPnl).toBe(50);
  });
  it('pause day retained; pause interior balance and cashflows excluded, resumed day counted', async () => {
    const h = fixture(); h.f.members = [member(3, { ...PRIVATE,
      普通__pauseDate: '2026-11-03', 普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-03', resumeDate: '2026-11-06' }]) })];
    h.f.records = [record('2026-11-02', 1000), record('2026-11-03', 900), record('2026-11-04', 1),
      record('2026-11-04', 500, { type: 'transfer', description: 'capital_add' }), record('2026-11-06', 800)];
    const tag = (await h.read()).members[0].tags[0];
    expect(tag.status).toBe('active'); expect(tag.totalPnl).toBe(100); expect(tag.dailyPnl).toBe(50);
    expect(tag.points.map(p => p.date)).toEqual(['2026-11-02','2026-11-03','2026-11-06']);
  });
  it('unresumed pause freezes at pause day; explicit [] supersedes stale legacy pause', async () => {
    const h = fixture(); h.f.members = [member(3, { ...PRIVATE, 普通__pauseDate: '2026-11-25' })];
    let tag = (await h.read()).members[0].tags[0]; expect(tag.status).toBe('paused'); expect(tag.totalPnl).toBe(50);
    h.f.members = [member(3, { ...PRIVATE, 普通__pauseDate: '2026-11-25', 普通__pauseHistory: '[]' })];
    tag = (await h.read()).members[0].tags[0]; expect(tag.status).toBe('active'); expect(tag.totalPnl).toBe(100);
  });
  it('endDate does not arbitrarily rewrite profits', async () => {
    const h = fixture(); h.f.members = [member(3, { ...PRIVATE, 普通__endDate: '2026-11-25' })];
    const tag = (await h.read()).members[0].tags[0]; expect(tag.status).toBe('ended'); expect(tag.totalPnl).toBe(100); expect(tag.notice).toContain('不冻结');
  });
  it('own/none filter createdBy before any builder or legacy valuation; no managerial override', async () => {
    const h = fixture(); h.f.records = [record('2026-11-25', 900), record(TODAY, 1, { createdBy: 7 })];
    h.f.members = [member(3, PRIVATE, { permissionView: 'own' })];
    expect((await h.read()).members[0].tags[0].asOf).toBe('2026-11-25');
    h.f.rules.set(10, [RULE]);
    expect((await h.read()).members[0].tags[0].asOf).toBe('2026-11-25');
    h.f.members[0].permissionView = 'none';
    const tag = (await h.read()).members[0].tags[0]; expect(tag.totalPnl).toBeNull(); expect(tag.points).toEqual([]);
  });
  it('legacy children path not equal root name; canonical rule maps nested categories to root and preserves record type', async () => {
    const h = fixture(); h.f.categories.push(cat(11, '子', 'manual_balance', 10), cat(12, '孙', 'manual_balance', 11));
    h.f.records = [record('2026-11-25', 900, { categoryId: 11 }), record(TODAY, 800, { categoryId: 12, type: 'expense' })];
    expect((await h.read()).members[0].tags[0].totalPnl).toBeNull();
    h.f.rules.set(10, [RULE]); expect((await h.read()).members[0].tags[0].totalPnl).not.toBeNull();
  });
  it('rule path calls real canonical engine, including downside reduction and exemption history', async () => {
    const h = fixture(); h.f.members = [member(3, { ...PRIVATE, 普通__ratio: 100 })];
    h.f.rules.set(10, [RULE]); h.f.records = [record('2026-11-02', 1000), record('2026-11-03', 900), record(TODAY, 800)];
    const expected = buildOrdinaryTagDownsideValuation({ ledgerId: 37, userId: 3, categoryId: 10, categoryName: '普通',
      balances: { ...PRIVATE, 普通__ratio: 100 }, records: h.f.records, rules: [RULE], userTagDownsideOverrides: [], today: TODAY });
    let tag = (await h.read()).members[0].tags[0]; expect(tag.totalPnl).toBe(expected.totalPnl); expect(tag.totalPnl).toBe(60);
    h.f.overrides = [{ ledgerId: 37, categoryId: 10, targetUserId: 3, actorUserId: 1, version: 1,
      mode: 'exempt', createdAt: '2026-11-25T01:00:00.000Z' }];
    tag = (await h.read()).members[0].tags[0]; expect(tag.totalPnl).toBe(200);
    expect(JSON.stringify(tag)).not.toContain('ruleVersion');
  });
  it('rule path pause history removes interior transfers and resumes normally', async () => {
    const h = fixture(); h.f.rules.set(10, [RULE]);
    const balances = { ...PRIVATE, 普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-03', resumeDate: '2026-11-06' }]) };
    h.f.members = [member(3, balances)]; h.f.records = [record('2026-11-02', 1000), record('2026-11-03', 900),
      record('2026-11-04', 10000, { type: 'transfer', description: 'capital_add' }), record('2026-11-04', 1), record(TODAY, 800)];
    const tag = (await h.read()).members[0].tags[0]; expect(tag.totalPnl).toBe(30); expect(tag.points.map(p => p.date)).not.toContain('2026-11-04');
  });
  it('does not include explicit observation-only/zero allocation as personal returns', async () => {
    const h = fixture(); const observation = JSON.stringify({ enabled: true, initialAmount: 1000, ratio: 100,
      startDate: '2026-11-02', pauseDate: null });
    for (const patch of [{ 普通__ratio: 0 }, { 普通__targetAmount: 0 }, { 普通__ordinaryObservation: observation }]) {
      h.f.members = [member(3, { ...PRIVATE, ...patch })];
      const m = (await h.read()).members[0]; expect(m.tags).toEqual([]); expect(m.totalPnl).toBeNull(); expect(m.startDate).toBeNull();
    }
  });
  it.each([{}, { 普通: 1000 }, { 普通__startDate: '2026-11-02' }, { ...PRIVATE, 普通__startDate: '2026-12-01' },
    { ...PRIVATE, 普通: null }, { ...PRIVATE, 普通__pauseHistory: '{' }])('missing/invalid participation is pending and never fabricated zero: %j', async balances => {
    const h = fixture(); h.f.members = [member(3, balances)];
    const m = (await h.read()).members[0]; expect(m.totalPnl).toBeNull(); expect(m.verifiedSubtotal).toBeNull();
    expect(m.tags[0].status).toBe('pending'); expect(m.pendingTagNames).toEqual(['普通']);
  });
  it('zero-only balance date is skipped exactly as legacy, but no-data remains null', async () => {
    const h = fixture(); h.f.records = [record(TODAY, 0)]; const m = (await h.read()).members[0];
    expect(m.tags[0].points).toEqual([]); expect(m.totalPnl).toBeNull();
  });
});
describe('personal stock R1 confirmed settlement, summaries and errors', () => {
  it('AI-renamed overview maps by categoryId; ignores live summary and does not multiply member ratio', async () => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')]; h.f.stock = [stockRow()];
    h.f.members = [member(3, { R1__ratio: 5, R1: 900000 })];
    const m = (await h.read()).members[0], tag = m.tags[0];
    expect(tag.name).toBe('R1'); expect(tag.totalPnl).toBe(120); expect(tag.asOf).toBe('2026-11-25');
    expect(tag.dailyPnl).toBeNull(); expect(m.latestDailyPnl).toBeNull(); expect(m.dailyPendingCount).toBe(1);
    expect(tag.points).toHaveLength(2); expect(tag.points[1].totalPnl).toBeNull(); expect(m.startDate).toBe('2026-11-02');
  });
  it('valid confirmed daily is taken only at expected date; history points fully returned on target detail', async () => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')];
    h.f.stock = [stockRow(20, { summary: { totalPnl: 999999, expectedDate: TODAY }, points: [
      { date: '2026-11-25', totalPnl: 120, dailyPnl: 20, ready: true },
      { date: TODAY, totalPnl: 180, dailyPnl: 60, dailyPnlReady: true, ready: true }] })];
    const m = (await h.read()).members[0]; expect(m.totalPnl).toBe(180); expect(m.latestDailyPnl).toBe(60);
    expect(m.dailyDate).toBe(TODAY); expect(m.tags[0].points).toHaveLength(2);
  });
  it('stock pause applies to summary metadata and chart points including resumed histories', async () => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')];
    h.f.members = [member(3, { R1__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-23', resumeDate: '2026-11-26' }]) })];
    h.f.stock = [stockRow(20, { points: [{ date: '2026-11-23', totalPnl: 50, dailyPnl: 5, ready: true },
      { date: '2026-11-25', totalPnl: 120, dailyPnl: 70, ready: true }] })];
    const tag = (await h.read()).members[0].tags[0]; expect(tag.totalPnl).toBe(50); expect(tag.asOf).toBe('2026-11-23');
    expect(tag.points.map(p => p.date)).toEqual(['2026-11-23']);
  });
  it.each(['total', 'observation', 'foreign ledger', 'foreign user', 'duplicate overview category'])('never uses %s stock scope as personal return', async kind => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')]; h.f.stock = [stockRow()];
    if (kind === 'total') h.f.stock[0].scope = 'total';
    if (kind === 'observation') h.f.stock[0].isObservation = true;
    if (kind === 'foreign ledger') h.f.stock[0].ledgerId = 38;
    if (kind === 'foreign user') h.f.stock[0].userId = 8;
    if (kind === 'duplicate overview category') h.f.stock.push(stockRow());
    const m = (await h.read()).members[0]; expect(m.totalPnl).toBeNull(); expect(m.tags[0].status).toBe('pending');
  });
  it('unallocated stock/observation not returned by personal loader is excluded', async () => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')];
    const m = (await h.read()).members[0]; expect(m.tags).toEqual([]); expect(m.totalPnl).toBeNull();
  });
  it('missing one tag keeps verifiedSubtotal, names and mixed asOfDates; never produces fake complete totals', async () => {
    const h = fixture(); h.f.categories = [cat(), cat(20, 'R1', 'stock_portfolio'), cat(30, '未配置')]; h.f.stock = [stockRow()];
    const m = (await h.read()).members[0]; expect(m.totalPnl).toBeNull(); expect(m.verifiedSubtotal).toBe(220);
    expect(m.pendingTagNames).toEqual(['未配置']); expect(m.asOfDates).toEqual(['2026-11-25', TODAY]);
    expect(m.latestDailyPnl).toBeNull(); expect(m.dailyPendingCount).toBe(2);
  });
  it('different valid daily dates (crypto versus stocks or old ordinary date) cannot be summed', async () => {
    const h = fixture(); h.f.categories = [cat(), cat(20, 'R1', 'stock_portfolio')];
    h.f.stock = [stockRow(20, { summary: { settlementPolicy: { usesCryptoPolicy: true }, expectedDate: '2026-11-25' },
      points: [{ date: '2026-11-25', totalPnl: 120, dailyPnl: 20, ready: true }] })];
    const m = (await h.read()).members[0]; expect(m.totalPnl).toBe(220); expect(m.latestDailyPnl).toBeNull();
    expect(m.dailyDate).toBeNull(); expect(m.dailyPendingCount).toBe(1);
  });
  it('crypto natural-day helper chooses last 15:05 date independently of A-stock date', async () => {
    vi.setSystemTime(new Date('2026-11-28T16:00:00+08:00'));
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')];
    h.f.stock = [stockRow(20, { summary: { usesCryptoPolicy: true }, points: [
      { date: '2026-11-28', totalPnl: 180, dailyPnl: 60, ready: true }] })];
    const m = (await h.read()).members[0]; expect(m.dailyDate).toBe('2026-11-28'); expect(m.latestDailyPnl).toBe(60);
  });
  it('only one failing member remains pending while other members return data, no raw SQL/credential exception', async () => {
    const h = fixture(); h.f.categories = [cat(), cat(20, 'R1', 'stock_portfolio')]; h.f.members.push(member(4));
    h.deps.loadStockOverview.mockImplementation(async id => { if (id === 3) throw new Error('SELECT password secretmysql://credential'); return [stockRow()]; });
    const data = await h.read({ ledgerId: 37 }); const failed = data.members[0];
    expect(failed.totalPnl).toBeNull(); expect(failed.verifiedSubtotal).toBe(100);
    expect(failed.tags.find(t => t.name === 'R1')?.notice).toContain('暂未核验');
    expect(data.members[1].totalPnl).toBe(220);
    expect(JSON.stringify(data)).not.toMatch(/SELECT|password|credential|mysql:/);
  });
  it('corrupt one member settings does not turn errors into zero or fail every other member', async () => {
    const h = fixture(); h.f.members[0].initialBalances = '{'; h.f.members.push(member(4));
    const data = await h.read({ ledgerId: 37 }); expect(data.members[0].totalPnl).toBeNull();
    expect(data.members[0].tags[0].notice).toContain('暂未核验'); expect(data.members[1].totalPnl).toBe(100);
  });
  it('global injected DB error is sanitized', async () => {
    const h = fixture(); h.deps.connection.execute.mockRejectedValue(new Error('SQL SELECT * mysql://secret'));
    await expect(h.read()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: '数据管理暂不可读取，请稍后重试' });
  });
  it('module has no business ensure, scanner, local price getter or whole-backend import', () => {
    const source = readFileSync(new URL('./ledger37-data-management.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"].*(?:routers|ledger-stock-portfolio|price-scanner|db)['"]/);
    expect(source).not.toMatch(/\bensure\w*\(|\bscan\w*\(|getPrice\(|fetch\(/);
    expect(source).toContain('buildOrdinaryTagDownsideValuation'); expect(source).toContain('stockOverviewSettlementDisplay');
  });
});

describe('participation-date daily scope and proven stock starts', () => {
  it('page-scoped actual stock starts replace legacy fallback without changing confirmed personal return', async () => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')];
    h.f.stock = [stockRow(20, { startDate: TODAY, startDateVerified: false })];
    h.f.stockStarts = [{ ledgerId: 37, userId: 3, categoryId: 20, startDate: '2026-11-02' }];
    const m = (await h.read()).members[0];
    expect(m.startDate).toBe('2026-11-02'); expect(m.totalPnl).toBe(120);
    const queries = h.deps.connection.execute.mock.calls.filter(c => c[0].includes('FROM ledger_stock_lot_participations p'));
    expect(queries).toHaveLength(1); expect(queries[0][1]).toEqual([3, TODAY]);
    expect(queries[0][0]).toContain('p.allocated_quantity > 0');
  });
  it.each([
    { ledgerId: 38, userId: 3, categoryId: 20, startDate: '2026-11-02' },
    { ledgerId: 37, userId: 8, categoryId: 20, startDate: '2026-11-02' },
    { ledgerId: 37, userId: 3, categoryId: 99, startDate: '2026-11-02' },
    { ledgerId: 37, userId: 3, categoryId: 20, startDate: '2026-12-02' },
  ])('stock start evidence outside the authenticated page scope fails closed: %j', async row => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')]; h.f.stockStarts = [row];
    await expect(h.read()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(h.deps.loadStockOverview).not.toHaveBeenCalled();
  });
  it('paused tag historical total remains in cumulative but is excluded after pause from daily scope', async () => {
    const h = fixture(); h.f.categories.push(cat(30, '暂停'));
    h.f.members = [member(3, { ...PRIVATE, 暂停: 1000, 暂停__ratio: 100, 暂停__startDate: '2026-11-02', 暂停__pauseDate: '2026-11-25' })];
    h.f.records.push(record('2026-11-25', 900, { categoryId: 30 }), record(TODAY, 1, { categoryId: 30 }));
    const m = (await h.read()).members[0];
    expect(m.totalPnl).toBe(200); expect(m.latestDailyPnl).toBe(50); expect(m.dailyDate).toBe(TODAY);
    expect(m.dailyPendingCount).toBe(0); expect(m.tags[1].pausePeriods).toEqual([{ pauseDate: '2026-11-25' }]);
  });
  it('pause day is included and mismatched paused daily on pause day is missing, not silently ignored', async () => {
    const h = fixture(); h.f.categories.push(cat(30, '暂停'));
    h.f.members = [member(3, { ...PRIVATE, 暂停: 1000, 暂停__ratio: 100, 暂停__startDate: '2026-11-02', 暂停__pauseDate: TODAY })];
    h.f.records.push(record('2026-11-25', 900, { categoryId: 30 }));
    const m = (await h.read()).members[0]; expect(m.totalPnl).toBe(200); expect(m.latestDailyPnl).toBeNull(); expect(m.dailyPendingCount).toBe(1);
  });
  it('resume day included; no matching resumed daily prevents complete total', async () => {
    const h = fixture(); h.f.categories.push(cat(30, '恢复'));
    h.f.members = [member(3, { ...PRIVATE, 恢复: 1000, 恢复__ratio: 100, 恢复__startDate: '2026-11-02',
      恢复__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-23', resumeDate: TODAY }]) })];
    h.f.records.push(record('2026-11-23', 900, { categoryId: 30 }));
    let m = (await h.read()).members[0]; expect(m.latestDailyPnl).toBeNull(); expect(m.dailyPendingCount).toBe(1);
    h.f.records.push(record(TODAY, 800, { categoryId: 30 }));
    m = (await h.read()).members[0]; expect(m.latestDailyPnl).toBe(150); expect(m.dailyPendingCount).toBe(0);
  });
  it('future configured tag is pending in cumulative but not in historical date daily scope', async () => {
    const h = fixture(); h.f.categories.push(cat(30, '未开始'));
    h.f.members = [member(3, { ...PRIVATE, 未开始: 1000, 未开始__ratio: 100, 未开始__startDate: '2026-12-01' })];
    const m = (await h.read()).members[0]; expect(m.totalPnl).toBeNull(); expect(m.latestDailyPnl).toBe(50); expect(m.dailyPendingCount).toBe(0);
  });
  it('bare stock startDate without proven source or actual member configuration is pending, not fallback today', async () => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')];
    h.f.stock = [stockRow(20, { startDate: TODAY, startDateVerified: false })];
    let m = (await h.read()).members[0]; expect(m.startDate).toBeNull(); expect(m.tags[0].totalPnl).toBeNull();
    h.f.members = [member(3, { R1__startDate: '2026-11-02' })];
    m = (await h.read()).members[0]; expect(m.startDate).toBe('2026-11-02'); expect(m.tags[0].totalPnl).toBe(120);
  });
  it('live summary totalPnl plus valuationDate cannot masquerade as published confirmation', async () => {
    const h = fixture(); h.f.categories = [cat(20, 'R1', 'stock_portfolio')];
    h.f.stock = [stockRow(20, { summary: { totalPnl: 999999, valuationDate: TODAY },
      points: [{ date: '2026-11-25', totalPnl: 120, dailyPnl: 20, ready: true }] })];
    expect((await h.read()).members[0].tags[0].totalPnl).toBe(120);
  });
  it('duplicate actor admin rows reject, even if all say admin', async () => {
    const h = fixture(); h.f.actor = { ...h.f.actor, ownerId: 9, memberRole: 'admin' };
    h.f.actors = [h.f.actor, h.f.actor]; await expect(h.read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
