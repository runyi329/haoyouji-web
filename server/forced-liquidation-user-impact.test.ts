import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import net from 'node:net';
const mocks = vi.hoisted(() => ({ db: vi.fn(), fx: vi.fn(), connect: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: mocks.db, getDbTransactionConnection: vi.fn(() => { throw new Error('NO TRANSACTION'); }) }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: mocks.fx }));
vi.mock('mysql2/promise', () => ({ default: { createPool: () => { throw new Error('REAL DB FORBIDDEN'); }, createConnection: () => { throw new Error('REAL DB FORBIDDEN'); } }, createPool: () => { throw new Error('REAL DB FORBIDDEN'); }, createConnection: () => { throw new Error('REAL DB FORBIDDEN'); } }));
vi.mock('mysql2', () => ({ default: { createPool: () => { throw new Error('REAL DB FORBIDDEN'); }, createConnection: () => { throw new Error('REAL DB FORBIDDEN'); } } }));
import { buildUserStockImpact, getForcedLiquidationUserImpact, getForcedLiquidationUsers, reconcileUserProfitCny, sumUserImpactCny, totalUserProfitsCny, userImpactLifecycle, verifiedUserProfitsCny } from './forced-liquidation-user-impact';
import { buildStockSaleFxLock } from './stock-sale-fx-locks';
import type { StockLotDownsideRule } from '../shared/stock-lot-downside';
const now = Date.parse('2026-11-26T03:00:00Z');
const p = (patch: Record<string, unknown> = {}) => ({ id: 10, ledger_id: 37, category_id: 81, user_id: 8, lot_id: 101,
  allocated_quantity: '30', remaining_quantity: '30', entry_price: '100', start_date: '2026-11-20', pause_date: null,
  assigned_at: '2026-11-20 09:30:00', actual_traded_at: '2026-11-20 09:30:00', unit_cost: '100', symbol: '600000.SH', stock_name: '浦发银行', ...patch });
const rule = (patch: Partial<StockLotDownsideRule> = {}): StockLotDownsideRule => ({ ledgerId: 37, categoryId: 81, lotId: 101, userId: 7,
  version: 1, enabled: true, thresholdPrice: 80, downsidePercent: 20, startDate: '2026-11-19', effectiveAt: '2026-11-18T16:00:00Z',
  baselineRawPrice: 80, baselineCountedPrice: 80, baselineStatus: 'ready', baselineSource: 'owner_threshold', currency: 'CNY', ...patch });
const quote = (symbol = '600000.SH', price: number | null = 60) => ({ symbol, price, priceDate: '2026-11-26', updatedAt: '2026-11-26T10:59:00+08:00', source: 'ledger_stock_intraday_quotes:intraday' });
const fx = { rate: 7, pair: 'USD/CNY' as const, stale: false, source: 'sina_usdcny', asOf: '2026-11-26T02:59:00Z' };
function build(patch: any = {}) { return buildUserStockImpact({ participation: p(), closures: [], rules: [rule()], epochs: [], quotes: [quote()], historicalQuotes: [], savedSales: [], exempt: false, now, fx, locks: new Map(), ...patch }); }
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => { throw new Error('REAL TCP FORBIDDEN'); }); mocks.fx.mockResolvedValue(fx); });
afterEach(() => vi.restoreAllMocks());

describe('本人实际累计raw-counted影响，绝不分摊全局分段金额', () => {
  it('以真实本人30股而非全账户份额计算', () => { expect(build()).toMatchObject({ quantity: 30, rawPnl: 1200, countedPnl: 720, ineffectiveFunds: 480, ineffectiveFundsCny: 480, status: 'ready' }); });
  it('门槛下后加入：真实入场抵消12元，影响120而非全局分段480', () => { expect(build({ participation: p({ entry_price: 65, assigned_at: '2026-11-21 09:30:00', start_date: '2026-11-21' }) })).toMatchObject({ rawPnl: 150, countedPnl: 30, ineffectiveFunds: 120, status: 'ready' }); });
  it('人工开仓价不能覆盖本人实际入场价', () => { expect(build({ participation: p({ entry_price: 65, unit_cost: 150 }) }).ineffectiveFunds).toBe(120); });
  it('用户豁免覆盖全部历史，入场抵消归零', () => { expect(build({ exempt: true, participation: p({ entry_price: 65 }) })).toMatchObject({ rawPnl: 150, countedPnl: 150, ineffectiveFunds: 0, ineffectiveFundsCny: 0 }); });
  it('回升可保留负号，不截成0', () => { expect(build({ participation: p({ entry_price: 65 }), quotes: [quote('600000.SH', 90)] })).toMatchObject({ rawPnl: -750, countedPnl: -390, ineffectiveFunds: -360 }); });
  it.each([0, 20, 100])('剩余比例%s与真实资金差一致', percent => { expect(build({ rules: [rule({ downsidePercent: percent })] }).ineffectiveFunds).toBe(30 * 20 * (1 - percent / 100)); });
  it('未来启用规则不提前：影响0原口径', () => { expect(build({ rules: [rule({ effectiveAt: '2099-11-01T00:00:00Z', startDate: '2099-11-01' })] })).toMatchObject({ rawPnl: 1200, countedPnl: 1200, ineffectiveFunds: 0 }); });
  it('关闭当前规则恢复raw', () => { expect(build({ rules: [rule({ enabled: false })] })).toMatchObject({ ineffectiveFunds: 0, rawPnl: 1200, countedPnl: 1200 }); });
  it('缺规则不伪造收益，但可确认没有强平影响', () => { expect(build({ rules: [], quotes: [] })).toMatchObject({ ineffectiveFunds: 0, ineffectiveFundsCny: 0, rawPnl: null, status: 'ready' }); });
  it('用户豁免缺价不伪造raw收益，影响为确知0', () => { expect(build({ exempt: true, quotes: [] })).toMatchObject({ rawPnl: null, countedPnl: null, ineffectiveFunds: 0, status: 'ready' }); });
  it.each([null, undefined, '', 'NaN', Infinity, -1])('非法本人入场%s保持pending', entry_price => { expect(build({ participation: p({ entry_price }) }).status).toBe('pending'); });
  it.each([null, undefined, '', 'NaN', Infinity, -1, 31])('非法本人余量%s不当作0', remaining_quantity => { expect(build({ participation: p({ remaining_quantity }) }).status).toBe('pending'); });
  it('完整退出数量不能仅据stored remaining推断', () => { expect(build({ participation: p({ remaining_quantity: 20 }) })).toMatchObject({ status: 'pending', ineffectiveFunds: null }); });
  it('未来参与不当成当期持仓收益', () => { expect(build({ participation: p({ start_date: '2099-01-01' }) }).status).toBe('pending'); });
  it.each([null, -1, Infinity, NaN])('最新坏价%s不回退开仓', price => { expect(build({ quotes: [quote('600000.SH', price)] }).status).toBe('pending'); });
  it('缺旧规则入場证明不能跟随时降级raw', () => { expect(build({ participation: p({ assigned_at: '2026-11-22 09:30:00' }), rules: [rule({ baselineSource: 'verified_close', baselineRawPrice: 100, baselineCountedPrice: 100 })] }).status).toBe('pending'); });
  it('用户豁免可合法绕过旧global pending基准', () => { expect(build({ exempt: true, rules: [rule({ baselineStatus: 'pending' })] })).toMatchObject({ status: 'ready', ineffectiveFunds: 0 }); });
});

describe('每笔实际退出与原有R1锁汇，不以当前价或当前汇率替历史', () => {
  const closure = (quantity = 10, price = 50, patch: any = {}) => ({ participation_id: 10, sell_event_id: 400, quantity, sale_price: price, actual_traded_at: '2026-11-24 10:00:00', ...patch });
  it('部分退出10股+剩余20股，累计差按两段本人实际份额', () => { expect(build({ participation: p({ remaining_quantity: 20 }), closures: [closure()] })).toMatchObject({ rawPnl: 1300, countedPnl: 740, ineffectiveFunds: 560 }); });
  it('全部已退出不再需要当前行情', () => { expect(build({ participation: p({ remaining_quantity: 0 }), closures: [closure(30)], quotes: [] })).toMatchObject({ rawPnl: 1500, countedPnl: 780, ineffectiveFunds: 720, status: 'ready' }); });
  it('legacy无startDate有saved counted_sale，exempt仍用真实raw', () => { expect(build({ exempt: true, participation: p({ remaining_quantity: 0 }), closures: [closure(30)], quotes: [],
    rules: [rule({ startDate: undefined })], savedSales: [{ lot_id: 101, sell_event_id: 400, counted_price: 100 }] })).toMatchObject({ rawPnl: 1500, countedPnl: 1500, ineffectiveFunds: 0 }); });
  it('R1原冻结6换算历史，当前7仅用于20股浮盈，不能重换全native', () => {
    const lock = buildStockSaleFxLock({ eventId: 400, ledgerId: 37, categoryId: 90250, currency: 'USD', lockedAt: '2026-11-24T03:00:00Z', quote: { rate: 6, pair: 'USD/CNY', stale: false, asOf: '2026-11-24T02:59:00Z', source: 'sina_usdcny' } });
    expect(build({ participation: p({ category_id: 90250, symbol: 'GOOG', remaining_quantity: 20 }), closures: [closure()], quotes: [quote('GOOG')],
      rules: [rule({ categoryId: 90250, currency: 'USD' })], locks: new Map([[400, lock]]) })).toMatchObject({ ineffectiveFunds: 560, ineffectiveFundsCny: 3680, status: 'ready' });
  });
  it('两次退出各自冻结汇率相加', () => {
    const lock = (eventId: number, rate: number) => buildStockSaleFxLock({ eventId, ledgerId: 37, categoryId: 90250, currency: 'USD', lockedAt: '2026-11-24T03:00:00Z', quote: { rate, pair: 'USD/CNY', stale: false, asOf: '2026-11-24T02:59:00Z', source: 'sina_usdcny' } });
    expect(build({ participation: p({ category_id: 90250, symbol: 'GOOG', remaining_quantity: 0 }), closures: [closure(10), closure(20, 60, { sell_event_id: 401 })], quotes: [],
      rules: [rule({ categoryId: 90250, currency: 'USD' })], locks: new Map([[400, lock(400, 6)], [401, lock(401, 7)]]) })).toMatchObject({ ineffectiveFunds: 560, ineffectiveFundsCny: 3680 });
  });
  it('R1历史有影响但缺冻结FX，不能用当前7补齐', () => { expect(build({ participation: p({ category_id: 90250, symbol: 'GOOG', remaining_quantity: 0 }), closures: [closure(30)], quotes: [], rules: [rule({ categoryId: 90250, currency: 'USD' })] }).status).toBe('pending'); });
  it('exempt历史影响0不需要重建冻结FX，也不伪造已支付', () => { expect(build({ exempt: true, participation: p({ category_id: 90250, symbol: 'GOOG', remaining_quantity: 0 }), closures: [closure(30)], quotes: [] })).toMatchObject({ ineffectiveFundsCny: 0, status: 'ready' }); });
  it.each([null, -1, Infinity, 31])('退出非法数量%s保持pending', quantity => { expect(build({ participation: p({ remaining_quantity: 0 }), closures: [closure(quantity as number)] }).status).toBe('pending'); });
});

describe('统一人民币转换、安全分值和完整总计', () => {
  it.each(['GOOG', 'CRYPTO:UNI-USDT'])('%s使用真实美元腿，不把U币当人民币', symbol => { expect(build({ participation: p({ symbol }), quotes: [quote(symbol)], rules: [rule({ currency: symbol.startsWith('CRYPTO') ? 'USDT' : 'USD' })] })).toMatchObject({ ineffectiveFunds: 480, ineffectiveFundsCny: 3360, status: 'ready' }); });
  it.each([null, { ...fx, stale: true }, { ...fx, rate: 0 }, { ...fx, rate: Infinity }, { ...fx, asOf: '2099-01-01T00:00:00Z' }])('坏FX不回退native/0: %o', fx => { expect(build({ participation: p({ symbol: 'GOOG' }), quotes: [quote('GOOG')], rules: [rule({ currency: 'USD' })], fx })).toMatchObject({ ineffectiveFunds: 480, ineffectiveFundsCny: null, status: 'pending' }); });
  it('真实人民币0/空scope确认为0', () => { expect(sumUserImpactCny([])).toBe(0); expect(sumUserImpactCny([{ ineffectiveFundsCny: 0, status: 'ready' }])).toBe(0); });
  it('逐显示分值相加，不重复取整', () => { expect(sumUserImpactCny([{ ineffectiveFundsCny: 0.01, status: 'ready' }, { ineffectiveFundsCny: 0.02, status: 'ready' }])).toBe(0.03); });
  it('正负影响相加保持符号', () => { expect(sumUserImpactCny([{ ineffectiveFundsCny: 10, status: 'ready' }, { ineffectiveFundsCny: -15, status: 'ready' }])).toBe(-5); });
  it('任一未知不返回不完整总和', () => { expect(sumUserImpactCny([{ ineffectiveFundsCny: 10, status: 'ready' }, { ineffectiveFundsCny: null, status: 'pending' }])).toBeNull(); });
  it('不能重新取整半分非展示值', () => { expect(sumUserImpactCny([{ ineffectiveFundsCny: 0.001, status: 'ready' }])).toBeNull(); });
  it('量大溢出保持pending', () => { expect(sumUserImpactCny([{ ineffectiveFundsCny: Number.MAX_SAFE_INTEGER, status: 'ready' }])).toBeNull(); });
});

describe('真实owner与目标用户严格隔离/批量SELECT-only', () => {
  const actor = { ledgerId: 37, userId: 7 };
  function fixture() {
    const calls: [string, unknown[]][] = [];
    const state = { owner: 7, members: [{ userId: 8, ledgerId: 37, memberType: 'real', realUserId: 8, nickname: '尤亮', name: '真实名称', username: 'DBW518', initialBalances: '{}' }], categories: [] as any[], lifecycle: [] as any[], records: [] as any[], ordinaryRules: [] as any[], overrideError: null as any };
    const conn = { execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push([sql, params]); if (!/^SELECT/.test(sql) || /FOR UPDATE|CREATE|INSERT|UPDATE |DELETE/.test(sql)) throw new Error('READ ONLY');
      if (sql.includes('FROM ledgers ')) return [[{ id: 37, ownerId: state.owner }]];
      if (sql.includes('FROM ledger_members m')) return [state.members];
      if (sql.includes('FROM ledger_categories ')) return [state.categories];
      if (sql.includes('FROM ledger_tag_config ')) return [state.lifecycle];
      if (sql.includes('FROM ledger_records ')) return [state.records];
      if (sql.includes('FROM ledger_user_tag_downside_overrides ')) { if (state.overrideError) throw state.overrideError; return [[]]; }
      if (sql.includes('FROM ledger_ordinary_tag_downside_rules ')) return [state.ordinaryRules];
      if (sql.includes('FROM ledger_stock_lot_downside_rules ')) return [[]];
      throw new Error('Unexpected SQL: ' + sql);
    }) }; mocks.db.mockResolvedValue(conn); return { state, conn, calls };
  }
  it('名单只返回最少姓名/账号，不返回wallet/角色/初始设置', async () => { const { calls } = fixture(); expect(await getForcedLiquidationUsers(actor)).toEqual({ ledgerId: 37, users: [{ userId: 8, displayName: '尤亮', username: 'DBW518' }] }); expect(calls).toHaveLength(2); });
  it.each([true, 'yes'])('viewAs=%s连接前拒绝', async isViewingAs => { fixture(); await expect(getForcedLiquidationUsers({ ...actor, isViewingAs: isViewingAs as boolean })).rejects.toThrow('代看'); expect(mocks.db).not.toHaveBeenCalled(); });
  it.each([0, -1, NaN, 37.5, 52])('ledger%s不能借owner角色越权', async ledgerId => { fixture(); await expect(getForcedLiquidationUsers({ ...actor, ledgerId })).rejects.toThrow(); expect(mocks.db).not.toHaveBeenCalled(); });
  it.each([0, -1, NaN, 7.5])('invalid actor%s零SQL', async userId => { const { calls } = fixture(); await expect(getForcedLiquidationUsers({ ...actor, userId })).rejects.toThrow(); expect(calls).toHaveLength(0); });
  it.each(['admin', 'super_admin', 'owner', undefined])('role%s不能替代真实owner', async systemRole => { const { state, calls } = fixture(); state.owner = 9; await expect(getForcedLiquidationUsers({ ...actor, systemRole })).rejects.toThrow('所有者'); expect(calls).toHaveLength(1); });
  it('目标不存在不能读取类别/规则', async () => { const { state, calls } = fixture(); state.members = []; await expect(getForcedLiquidationUserImpact({ ...actor, targetUserId: 8 })).rejects.toThrow('真实成员'); expect(calls).toHaveLength(2); });
  it('名单AI伪成员/外账本/重复身份不能当真实用户', async () => { const { state } = fixture(); state.members[0].memberType = 'ai'; await expect(getForcedLiquidationUsers(actor)).rejects.toThrow('真实成员'); });
  it('用户范围错配不输出旧用户统计', async () => { fixture(); await expect(getForcedLiquidationUserImpact({ ...actor, targetUserId: 9 })).rejects.toThrow('范围'); });
  it('损坏初始JSON不默许参与范围', async () => { const { state } = fixture(); state.members[0].initialBalances = '{bad'; await expect(getForcedLiquidationUserImpact({ ...actor, targetUserId: 8 })).rejects.toThrow('损坏'); });
  it('空真实参与scope是0；只读无FX无交易/DDL', async () => { const { calls } = fixture(); expect(await getForcedLiquidationUserImpact({ ...actor, targetUserId: 8 })).toMatchObject({ targetUserId: 8, categories: [], totalImpactCny: 0, status: 'ready' }); expect(calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true); expect(mocks.fx).not.toHaveBeenCalled(); });
  it('override故障不能当未设豁免', async () => { const { state } = fixture(); state.overrideError = new Error('offline'); await expect(getForcedLiquidationUserImpact({ ...actor, targetUserId: 8 })).rejects.toThrow('offline'); });
  it('无参与也显示标签控制，不读取历史金额或其他用户', async () => { const { state, calls } = fixture(); state.categories = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, ledgerId: 37, parentId: null, isDefault: 0, name: `标签${i}`, accountingMode: 'manual_balance' })); const result = await getForcedLiquidationUserImpact({ ...actor, targetUserId: 8 }); expect(result.categories).toHaveLength(100); expect(result.totalImpactCny).toBe(0); expect(calls.filter(([sql]) => sql.includes('FROM ledger_user_tag_downside_overrides '))).toHaveLength(2); expect(calls.some(([sql]) => sql.includes('ledger_records'))).toBe(false); });
  it('路由采用owner check+strict target契约，而非viewAs调用本人接口', () => { const src = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8'); const part = src.slice(src.indexOf('    getForcedLiquidationUsers:'), src.indexOf('    setOrdinaryTagDownsideRule:')); expect(part.match(/assertLedger37Owner/g)).toHaveLength(3); expect(part.match(/\.strict\(\)/g)).toHaveLength(3); expect(part).not.toContain('getMyStockTag'); expect(part).not.toContain('viewAsUserId'); });
});

describe('额外证据边界，不用默认币种或观察份额伪造个人影响', () => {
  it.each(['CRYPTO:UNI', 'CRYPTO:', '', 'unknown/asset', '600000'])('非法标识%s不回退CNY', symbol => { expect(build({ participation: p({ symbol }), quotes: [quote(symbol)] })).toMatchObject({ status: 'pending', ineffectiveFundsCny: null }); });
  it('全批次数量证据冲突保持pending', () => { expect(build({ participation: p({ allocation_valid: false }) })).toMatchObject({ status: 'pending', ineffectiveFunds: null }); });
  it.each([
    [{ pause_date: '2026-11-20' }, 'paused'],
    [{ pause_date: '2026-11-20', margin_pause_date: '2026-11-21' }, 'paused'],
    [{ pause_date: '2026-11-20', end_date: '2026-11-21' }, 'ended'],
    [{ pause_date: '2099-01-01', end_date: '2099-01-02' }, 'active'],
    [{ pause_date: '2026-02-30' }, 'active'],
    [{}, 'active'],
  ])('全局生命周期%o→%s', (config, expected) => { expect(userImpactLifecycle(config, '2026-11-26')).toBe(expected); });
  it('统计期间全局规则或个人初始配置变化拒绝混合快照', async () => {
    let membersReads = 0;
    mocks.db.mockResolvedValue({ execute: vi.fn(async (sql: string) => {
      if (!/^SELECT/.test(sql)) throw new Error('ONLY SELECT');
      if (sql.includes('FROM ledgers ')) return [[{ id: 37, ownerId: 7 }]];
      if (sql.includes('FROM ledger_members m')) return [[{ userId: 8, ledgerId: 37, memberType: 'real', realUserId: 8, nickname: '姓名', username: '账号', initialBalances: ++membersReads === 1 ? '{}' : '{"某标签":100}' }]];
      if (sql.includes('FROM ledger_categories ') || sql.includes('FROM ledger_tag_config ') || sql.includes('FROM ledger_user_tag_downside_overrides ') || sql.includes('FROM ledger_stock_lot_downside_rules ') || sql.includes('FROM ledger_ordinary_tag_downside_rules ')) return [[]];
      throw new Error('Unexpected SQL');
    }) });
    await expect(getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('普通观察仅参考比例不算作真实个人收益', async () => {
    const observation = JSON.stringify({ enabled: true, initialAmount: 100, ratio: 100, startDate: '2026-11-20', pauseDate: null });
    mocks.db.mockResolvedValue({ execute: vi.fn(async (sql: string) => {
      if (!/^SELECT/.test(sql)) throw new Error('ONLY SELECT');
      if (sql.includes('FROM ledgers ')) return [[{ id: 37, ownerId: 7 }]];
      if (sql.includes('FROM ledger_members m')) return [[{ userId: 8, ledgerId: 37, memberType: 'real', realUserId: 8, nickname: '姓名', username: '账号', initialBalances: JSON.stringify({ 普通: 100, 普通__startDate: '2026-11-20', 普通__ratio: 0, 普通__ordinaryObservation: observation }) }]];
      if (sql.includes('FROM ledger_categories ')) return [[{ id: 11, ledgerId: 37, parentId: null, isDefault: 0, name: '普通', accountingMode: 'manual_balance' }]];
      if (sql.includes('FROM ledger_tag_config ') || sql.includes('FROM ledger_records ') || sql.includes('FROM ledger_user_tag_downside_overrides ') || sql.includes('FROM ledger_stock_lot_downside_rules ') || sql.includes('FROM ledger_ordinary_tag_downside_rules ')) return [[]];
      throw new Error('Unexpected SQL');
    }) });
    const result = await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 });
    expect(result.categories[0]).toMatchObject({ participationStatus: 'none', lines: [], ineffectiveFundsCny: 0 });
  });
});

describe('普通标签默认零值不伪造已参与范围', () => {
  it('只有默认0本金/比例且无真实开始日期时显示未参与，不读该标签流水', async () => {
    const calls: string[] = [];
    mocks.db.mockResolvedValue({ execute: vi.fn(async (sql: string) => {
      calls.push(sql); if (!/^SELECT/.test(sql)) throw new Error('ONLY SELECT');
      if (sql.includes('FROM ledgers ')) return [[{ id: 37, ownerId: 7 }]];
      if (sql.includes('FROM ledger_members m')) return [[{ userId: 8, ledgerId: 37, memberType: 'real', realUserId: 8, nickname: '姓名', username: '账号', initialBalances: JSON.stringify({ 普通: 0, 普通__ratio: 0, 普通__targetAmount: 0, 普通__startDate: '' }) }]];
      if (sql.includes('FROM ledger_categories ')) return [[{ id: 11, ledgerId: 37, parentId: null, isDefault: 0, name: '普通', accountingMode: 'manual_balance' }]];
      if (sql.includes('FROM ledger_tag_config ') || sql.includes('FROM ledger_user_tag_downside_overrides ') || sql.includes('FROM ledger_stock_lot_downside_rules ') || sql.includes('FROM ledger_ordinary_tag_downside_rules ')) return [[]];
      throw new Error('Unexpected SQL: ' + sql);
    }) });
    const result = await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 });
    expect(result.categories[0]).toMatchObject({ participationStatus: 'none', lines: [], ineffectiveFundsCny: 0 });
    expect(calls.some(sql => sql.includes('FROM ledger_records '))).toBe(false);
  });
});

describe('新增两个人民币累计获利与原影响总计同口径对账', () => {
  it('人民币真实累计获利与当前计入获利', () => {
    const line = build();
    expect(line).toMatchObject({ rawPnlCny: 1200, countedPnlCny: 720, ineffectiveFundsCny: 480 });
    expect(totalUserProfitsCny([line])).toEqual({ totalRawPnlCny: 1200, totalCountedPnlCny: 720, profitPendingCount: 0 });
  });
  it.each(['GOOG', 'CRYPTO:UNI-USDT'])('%s两个绝对获利都用同一有效美元腿', symbol => {
    expect(build({ participation: p({ symbol }), quotes: [quote(symbol)], rules: [rule({ currency: symbol.startsWith('CRYPTO') ? 'USDT' : 'USD' })] }))
      .toMatchObject({ rawPnlCny: 8400, countedPnlCny: 5040, ineffectiveFundsCny: 3360 });
  });
  it('负收益及负影响不截零', () => {
    expect(build({ participation: p({ entry_price: 65 }), quotes: [quote('600000.SH', 90)] }))
      .toMatchObject({ rawPnlCny: -750, countedPnlCny: -390, ineffectiveFundsCny: -360 });
  });
  it('豁免的外币绝对获利仍需要有效汇率', () => {
    expect(build({ exempt: true, participation: p({ symbol: 'GOOG' }), quotes: [quote('GOOG')] }))
      .toMatchObject({ rawPnlCny: 8400, countedPnlCny: 8400, ineffectiveFundsCny: 0 });
    const line = build({ exempt: true, participation: p({ symbol: 'GOOG' }), quotes: [quote('GOOG')], fx: null });
    expect(line).toMatchObject({ rawPnl: 1200, countedPnl: 1200, rawPnlCny: null, countedPnlCny: null, ineffectiveFundsCny: 0, status: 'ready' });
    expect(totalUserProfitsCny([line])).toEqual({ totalRawPnlCny: null, totalCountedPnlCny: null, profitPendingCount: 1 });
  });
  it('没有规则的外币影响0与绝对获利缺汇率独立', () => {
    expect(build({ rules: [], participation: p({ symbol: 'GOOG' }), quotes: [quote('GOOG')], fx: null }))
      .toMatchObject({ rawPnl: 1200, countedPnl: 1200, rawPnlCny: null, countedPnlCny: null, ineffectiveFundsCny: 0, status: 'ready' });
  });
  it('不受影响但缺行情，不能由影响0反推两个收益0', () => {
    const line = build({ exempt: true, quotes: [] });
    expect(line).toMatchObject({ rawPnlCny: null, countedPnlCny: null, ineffectiveFundsCny: 0, status: 'ready' });
    expect(totalUserProfitsCny([line]).profitPendingCount).toBe(1);
  });
  it('外币确知零收益不需要假汇率', () => {
    expect(build({ rules: [], participation: p({ symbol: 'GOOG' }), quotes: [quote('GOOG', 100)], fx: null }))
      .toMatchObject({ rawPnlCny: 0, countedPnlCny: 0, ineffectiveFundsCny: 0 });
  });
  const closure = (quantity: number, sale_price: number, sell_event_id = 400) => ({ quantity, sale_price, sell_event_id, actual_traded_at: '2026-11-24 10:00:00' });
  const lock = (eventId: number, rate: number) => buildStockSaleFxLock({ eventId, ledgerId: 37, categoryId: 90250, currency: 'USD', lockedAt: '2026-11-24T03:00:00Z', quote: { rate, pair: 'USD/CNY', stale: false, asOf: '2026-11-24T02:59:00Z', source: 'sina_usdcny' } });
  it('原锁汇6只折算退出，当前7只折算浮盈，两个绝对获利均不重换历史', () => {
    expect(build({ participation: p({ category_id: 90250, symbol: 'GOOG', remaining_quantity: 20 }), closures: [closure(10, 50)], quotes: [quote('GOOG')],
      rules: [rule({ categoryId: 90250, currency: 'USD' })], locks: new Map([[400, lock(400, 6)]]) }))
      .toMatchObject({ rawPnl: 1300, countedPnl: 740, rawPnlCny: 8600, countedPnlCny: 4920, ineffectiveFundsCny: 3680 });
  });
  it('两次不同冻结汇率累计，全部退出无需现汇', () => {
    expect(build({ participation: p({ category_id: 90250, symbol: 'GOOG', remaining_quantity: 0 }), closures: [closure(10, 50), closure(20, 60, 401)], quotes: [], fx: null,
      rules: [rule({ categoryId: 90250, currency: 'USD' })], locks: new Map([[400, lock(400, 6)], [401, lock(401, 7)]]) }))
      .toMatchObject({ rawPnlCny: 8600, countedPnlCny: 4920, ineffectiveFundsCny: 3680 });
  });
  it('R1豁免缺冻结汇率保持影响0，但两个累计获利待核验，不能用当前FX补历史', () => {
    expect(build({ exempt: true, participation: p({ category_id: 90250, symbol: 'GOOG', remaining_quantity: 0 }), closures: [closure(30, 50)], quotes: [] }))
      .toMatchObject({ rawPnl: 1500, countedPnl: 1500, rawPnlCny: null, countedPnlCny: null, ineffectiveFundsCny: 0, status: 'ready' });
  });
  it('R1豁免仍按历史原锁汇展示raw和counted，不改原退出', () => {
    expect(build({ exempt: true, participation: p({ category_id: 90250, symbol: 'GOOG', remaining_quantity: 0 }), closures: [closure(30, 50)], quotes: [], locks: new Map([[400, lock(400, 6)]]) }))
      .toMatchObject({ rawPnlCny: 9000, countedPnlCny: 9000, ineffectiveFundsCny: 0 });
  });
  it.each([[1.004, 0.998, 0.01, 1, 0.99], [-1.004, -0.998, -0.01, -1, -0.99], [1.005, 0.999, 0.01, 1.01, 1]])
    ('raw %s/count %s保持原影响%s，避免独立取整产生一分错差', (raw, counted, impact, displayRaw, displayCounted) => {
      expect(reconcileUserProfitCny(raw, counted, impact, now)).toEqual({ rawPnlCny: displayRaw, countedPnlCny: displayCounted });
    });
  it.each([[null, 1], [1, null], [Infinity, 1], [1, NaN], [Number.MAX_SAFE_INTEGER, 1]])
    ('缺失/溢出获利%s/%s不能反推成数值', (raw, counted) => {
      expect(reconcileUserProfitCny(raw, counted, 0, now)).toEqual({ rawPnlCny: null, countedPnlCny: null });
    });
  it('不一致影响不是合法获利证据', () => {
    expect(reconcileUserProfitCny(100, 90, 20, now)).toEqual({ rawPnlCny: null, countedPnlCny: null });
    expect(totalUserProfitsCny([{ rawPnlCny: 100, countedPnlCny: 90, ineffectiveFundsCny: 20 }])).toEqual({ totalRawPnlCny: null, totalCountedPnlCny: null, profitPendingCount: 1 });
  });
  it('多个正负小金额精确分值汇总，两个总计差恰好原影响总计', () => {
    const lines = [
      { ...reconcileUserProfitCny(1.004, 0.998, 0.01, now), ineffectiveFundsCny: 0.01, status: 'ready' },
      { ...reconcileUserProfitCny(-1.004, -0.988, -0.02, now), ineffectiveFundsCny: -0.02, status: 'ready' },
      { ...reconcileUserProfitCny(10.003, 6.996, 3.01, now), ineffectiveFundsCny: 3.01, status: 'ready' },
    ];
    const totals = totalUserProfitsCny(lines);
    expect(totals).toEqual({ totalRawPnlCny: 10, totalCountedPnlCny: 7, profitPendingCount: 0 });
    expect(sumUserImpactCny(lines)).toBe(3);
  });
  it('任一参与获利未知不展示部分绝对总计，不影响已有完整影响总计', () => {
    const lines = [build(), build({ exempt: true, quotes: [] })];
    expect(sumUserImpactCny(lines)).toBe(480);
    expect(totalUserProfitsCny(lines)).toEqual({ totalRawPnlCny: null, totalCountedPnlCny: null, profitPendingCount: 1 });
  });
  it('无真实参与scope，两个获利与影响均明确0', () => {
    expect(totalUserProfitsCny([])).toEqual({ totalRawPnlCny: 0, totalCountedPnlCny: 0, profitPendingCount: 0 });
  });
  it('两个绝对总计超安全分值不伪造有限值', () => {
    expect(totalUserProfitsCny(Array.from({ length: 2 }, () => ({ rawPnlCny: 50_000_000_000_000, countedPnlCny: 50_000_000_000_000, ineffectiveFundsCny: 0 }))))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null });
  });
});

describe('两个获利总计服务级真实范围及独立完整性', () => {
  function readOnlyFixture(initial: Record<string, unknown> = {}, ordinaryRecords: any[] = [], ordinaryRules: any[] = [], stock = false, exempt = false,
    quoteWindow?: { capturedAt: string; readCompletedAt: number; symbol?: string; price?: number | null }) {
    const calls: string[] = [];
    mocks.db.mockResolvedValue({ execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      if (!/^SELECT/.test(sql) || /FOR UPDATE|CREATE|INSERT|UPDATE |DELETE/.test(sql)) throw new Error('ONLY READ');
      if (sql.includes('FROM ledgers ')) return [[{ id: 37, ownerId: 7 }]];
      if (sql.includes('FROM ledger_members m')) return [[{ userId: 8, ledgerId: 37, memberType: 'real', realUserId: 8, nickname: '本人', username: '本人账号', initialBalances: JSON.stringify(initial) }]];
      if (sql.includes('FROM ledger_categories ')) return [[{ id: stock ? 90250 : 11, ledgerId: 37, parentId: null, isDefault: 0, name: stock ? 'R1' : '普通', accountingMode: stock ? 'stock_portfolio' : 'manual_balance' }]];
      if (sql.includes('FROM ledger_user_tag_downside_overrides ')) return [exempt ? [{ ledger_id: 37, category_id: stock ? 90250 : 11, target_user_id: 8, actor_user_id: 7, version: 1, mode: 'exempt', created_at: '2026-11-25T01:00:00.000Z' }] : []];
      if (sql.includes('FROM ledger_ordinary_tag_downside_rules ')) return [ordinaryRules];
      if (sql.startsWith('SELECT p.id,p.ledger_id,p.category_id,p.user_id,p.lot_id,p.allocated_quantity')) return [[p({ category_id: 90250, symbol: quoteWindow?.symbol ?? 'GOOG' })]];
      if (sql.includes('FROM ledger_stock_lots l WHERE')) return [[{ lot_id: 101, ledger_id: 37, category_id: 90250, initial_quantity: 30, sold_quantity: 0, member_remaining: 30 }]];
      if (sql.includes('FROM ledger_stock_price_snapshots ')) return [[{ ledger_id: 37, category_id: 90250, symbol: 'GOOG', price: 60, price_date: '2026-11-26', captured_at: '2026-11-26 10:59:00.000000' }]];
      if (sql.includes('FROM ledger_stock_intraday_quotes ') && quoteWindow) {
        vi.mocked(Date.now).mockReturnValue(quoteWindow.readCompletedAt);
        // Model the continuously-upserted unique row: the old version no longer exists.
        if (sql.includes('captured_at<=?') && quoteWindow.capturedAt > String(params.at(-1))) return [[]];
        return [[{ ledger_id: 37, category_id: 90250, symbol: quoteWindow.symbol ?? 'GOOG',
          price: quoteWindow.price === undefined ? 60 : quoteWindow.price,
          price_date: '2026-11-26', captured_at: quoteWindow.capturedAt }]];
      }
      if (sql.includes('FROM ledger_records ')) return [ordinaryRecords];
      if (sql.includes('FROM ledger_tag_config ') || sql.includes('FROM ledger_stock_lot_downside_rules ') || sql.includes('FROM ledger_stock_participation_closures ')
        || sql.includes('FROM ledger_stock_intraday_quotes ') || sql.includes('FROM ledger_stock_unified_close_prices ')) return [[]];
      throw new Error('Unexpected SQL: ' + sql);
    }) });
    return calls;
  }
  const record = (recordDate: string, amount: number, recordId: number) => ({ ledgerId: 37, categoryId: 11, recordDate, amount, recordId, type: 'income', createdAt: '2026-11-26 01:00:00.000000', deletedAt: null });
  const savedOrdinaryRule = { ledger_id: 37, category_id: 11, user_id: 7, version: 1, enabled: 1, threshold_amount: 1000, downside_percent: 30, start_date: '2026-11-02', created_at: '2026-11-25T01:02:03.000Z' };
  it.each([false, true])('普通有效区间没有金额记录按约定计0，存在全局规则=%s', async hasRule => {
    const calls = readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02' }, [], hasRule ? [savedOrdinaryRule] : []);
    const result = await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 });
    expect(result).toMatchObject({ totalRawPnlCny: 0, totalCountedPnlCny: 0, totalImpactCny: 0, profitPendingCount: 0,
      profitScope: 'complete', excludedProfitCategories: [], profitImpactMatchesTotal: true });
    expect(result.categories[0].lines[0]).toMatchObject({ rawPnl: 0, countedPnl: 0, rawPnlCny: 0, countedPnlCny: 0,
      ineffectiveFundsCny: 0, latestDate: null, profitBasis: 'no_data_zero', status: 'ready' });
    expect(result.categories[0].lines[0].notice).toContain('按约定计0');
    expect(result.notice).toContain('按约定计0');
    expect(calls.every(sql => /^SELECT/.test(sql))).toBe(true);
    expect(mocks.fx).not.toHaveBeenCalled();
  });
  it('修正参与日期后仅有更早三条零登记，不能再把30万元本金乘35%算成10.5万元获利', async () => {
    const initial = { 普通: 300000, 普通__ratio: 35, 普通__startDate: '2026-07-05', 普通__pauseDate: '2026-07-21',
      普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-07-21' }]) };
    const records = ['2026-06-04', '2026-06-05', '2026-06-08'].map((date, index) => ({ ...record(date, 0, index + 1), type: 'expense' }));
    const before = JSON.stringify({ initial, records });
    readOnlyFixture(initial, records);
    const result = await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 });
    expect(result).toMatchObject({ totalRawPnlCny: 0, totalCountedPnlCny: 0, totalImpactCny: 0, profitPendingCount: 0, excludedProfitCategories: [] });
    expect(result.categories[0].lines[0]).toMatchObject({ entryDate: '2026-07-05', latestDate: null, profitBasis: 'no_data_zero' });
    expect(JSON.stringify({ initial, records })).toBe(before);
  });
  it('只有暂停后金额不属于本人区间，约定零值不倒灌暂停后的余额', async () => {
    readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02', 普通__pauseDate: '2026-11-03' }, [record('2026-11-04', 900, 1)]);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: 0, totalCountedPnlCny: 0, totalImpactCny: 0, profitPendingCount: 0 });
  });
  it('无记录且用户豁免仍按无数据约定计0，不伪造行情或资金流', async () => {
    readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02' }, [], [savedOrdinaryRule], false, true);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: 0, totalCountedPnlCny: 0, totalImpactCny: 0, profitPendingCount: 0 });
  });
  it.each([
    { 普通: 1000, 普通__ratio: 50 },
    { 普通: 1000, 普通__ratio: 50, 普通__startDate: '2099-11-02' },
    { 普通: 1000, 普通__ratio: 'bad', 普通__startDate: '2026-11-02' },
    { 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02', 普通__pauseHistory: 'broken' },
  ])('缺日期、未来参与或异常配置仍待核验，不套用无记录计0：%j', async initial => {
    readOnlyFixture(initial);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, totalImpactCny: 0, profitPendingCount: 1 });
  });
  it.each([
    { 普通__pauseDate: '2026-11-01' },
    { 普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-01' }]) },
    { 普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-01', resumeDate: '2026-11-03' }]) },
    { 普通__pauseDate: 'not-a-date' },
    { 普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-03', resumeDate: '2026-11-02' }]) },
    { 普通__pauseHistory: 'broken', 普通__pauseDate: '2026-11-03' },
    { 普通__endDate: 'not-a-date' },
    { 普通__endDate: '2026-11-01' },
    { 普通__endDate: '2099-02-30T00:00:00Z' },
    { 普通__endDate: '2099-02-30' },
    { 普通__pauseDate: '2026-11-03 99:99:99' },
    { 普通__startDate: '2026-02-30T00:00:00Z' },
    { 普通__pauseHistory: JSON.stringify([{ pauseDate: '2099-02-30T00:00:00Z' }]) },
    { 普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-03', resumeDate: '2026-11-04 99:99:99' }]) },
  ])('异常参与区间不能把空记录或非零记录标成已核验获利：%j', async patch => {
    for (const records of [[], [record('2026-11-02', 900, 1)]]) {
      readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02', ...patch }, records);
      const result = await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 });
      expect(result).toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, totalImpactCny: 0, profitPendingCount: 1 });
      expect(result.categories[0].lines[0].profitBasis).toBeUndefined();
      expect(result.categories[0].lines[0].notice).toContain('不按0统计');
    }
  });
  it.each([
    { 普通__pauseDate: '2026-11-02' },
    { 普通__pauseHistory: JSON.stringify([{ pauseDate: '2026-11-01', resumeDate: '2026-11-02' }]) },
    { 普通__pauseDate: '2026-11-01', 普通__pauseHistory: '[]' },
  ])('同日暂停、入场前已恢复或有效空历史覆盖旧暂停日，保留合法无数据计0：%j', async patch => {
    readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02', ...patch });
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: 0, totalCountedPnlCny: 0, totalImpactCny: 0, profitPendingCount: 0 });
  });
  it('异常暂停区间有强平规则时影响也待核验，不套用无数据零值', async () => {
    readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02', 普通__pauseDate: '2026-11-01' }, [], [savedOrdinaryRule]);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, totalImpactCny: null, profitPendingCount: 1, status: 'pending' });
  });
  it('已登记但金额缺失属于pending而非无数据，两个绝对获利不假0', async () => {
    readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02' }, [{ ...record('2026-11-26', 900, 1), amount: null }]);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, totalImpactCny: 0, profitPendingCount: 1 });
  });
  it('R1数字币在请求中更新报价，按真实读取完成时刻接纳，不再把整个标签排除', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const readCompletedAt = now + 10000;
    const calls = readOnlyFixture({}, [], [], true, false, { symbol: 'CRYPTO:UNI-USDT', capturedAt: '2026-11-26 11:00:05.000000', readCompletedAt });
    const result = await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 });
    expect(result).toMatchObject({ totalRawPnlCny: 8400, totalCountedPnlCny: 8400, totalImpactCny: 0,
      asOf: new Date(readCompletedAt).toISOString(), profitScope: 'complete', excludedProfitCategories: [] });
    expect(calls.find(sql => sql.includes('FROM ledger_stock_intraday_quotes '))).not.toContain('captured_at<=?');
    expect(calls.filter(sql => /FROM ledger_stock_(?:price_snapshots|unified_close_prices) /.test(sql)).every(sql => sql.includes('captured_at<=?'))).toBe(true);
    expect(calls.find(sql => sql.includes('FROM ledger_stock_participation_closures '))).toContain('e.actual_traded_at<=?');
  });
  it('报价在实际读取时刻仍来自未来，即使后续FX读取时间已超过它也不能被洗成有效报价', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    readOnlyFixture({}, [], [], true, false, { symbol: 'CRYPTO:UNI-USDT', capturedAt: '2026-11-26 11:00:20.000000', readCompletedAt: now + 10000 });
    mocks.fx.mockImplementation(async () => { clock.mockReturnValue(now + 30000); return fx; });
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, totalImpactCny: 0, profitPendingCount: 1 });
  });
  it('最新已读报价金额无效，不因旧收盘价存在而回退旧值', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    readOnlyFixture({}, [], [], true, false, { capturedAt: '2026-11-26 11:00:05.000000', readCompletedAt: now + 10000, price: null });
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, totalImpactCny: 0, profitPendingCount: 1 });
  });
  it('读取跨越北京业务日返回冲突，不混用旧日成员范围和新日行情', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    readOnlyFixture({}, [], [], true, false, { capturedAt: '2026-11-26 11:00:05.000000', readCompletedAt: Date.parse('2026-11-26T16:00:01Z') });
    await expect(getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 })).rejects.toThrow('统计读取跨越业务日期');
  });
  it('普通标签获利按本人比例和已保存规则，两个获利差等于原影响', async () => {
    readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02' }, [record('2026-11-02', 1000, 1), record('2026-11-26', 900, 2)], [savedOrdinaryRule]);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: 50, totalCountedPnlCny: 15, totalImpactCny: 35, profitPendingCount: 0 });
    expect(mocks.fx).not.toHaveBeenCalled();
  });
  it('普通用户级豁免优先：两个获利均为真实raw，不改变标签规则', async () => {
    const calls = readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02' }, [record('2026-11-02', 1000, 1), record('2026-11-26', 900, 2)], [savedOrdinaryRule], false, true);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: 50, totalCountedPnlCny: 50, totalImpactCny: 0, profitPendingCount: 0 });
    expect(calls.every(sql => /^SELECT/.test(sql))).toBe(true);
  });
  it('普通个人结束历史收益未证明，两个总计待核验但无规则影响为0', async () => {
    readOnlyFixture({ 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-02', 普通__endDate: '2026-11-20' }, [record('2026-11-02', 1000, 1), record('2026-11-26', 900, 2)]);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, totalImpactCny: 0, profitPendingCount: 1, status: 'ready' });
  });
  it('观察-only及未参与scope的三个总计均为0，不取汇率', async () => {
    readOnlyFixture({ 普通: 1000, 普通__ratio: 0, 普通__startDate: '2026-11-02', 普通__ordinaryObservation: JSON.stringify({ enabled: true, initialAmount: 1000, ratio: 50, startDate: '2026-11-02', pauseDate: null }) });
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: 0, totalCountedPnlCny: 0, totalImpactCny: 0, profitPendingCount: 0 });
    expect(mocks.fx).not.toHaveBeenCalled();
  });
  it('股票已保存exempt仍取有效FX且只取一次，用于两个绝对获利', async () => {
    readOnlyFixture({}, [], [], true, true);
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: 8400, totalCountedPnlCny: 8400, totalImpactCny: 0, profitPendingCount: 0 });
    expect(mocks.fx).toHaveBeenCalledTimes(1);
  });
  it('已保存exempt取FX失败不影响已知0，但两个绝对获利不能假0', async () => {
    readOnlyFixture({}, [], [], true, true); mocks.fx.mockRejectedValue(new Error('No quote'));
    expect(await getForcedLiquidationUserImpact({ ledgerId: 37, userId: 7, targetUserId: 8 }))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, totalImpactCny: 0, profitPendingCount: 1, status: 'ready' });
    expect(mocks.fx).toHaveBeenCalledTimes(1);
  });
});

describe('用户授权的已核验整标签获利范围', () => {
  const line = (rawPnlCny: number | null, countedPnlCny: number | null, ineffectiveFundsCny: number | null) => ({ ...build(), rawPnlCny, countedPnlCny, ineffectiveFundsCny });
  const category = (id: number, lines: ReturnType<typeof line>[], patch: any = {}) => ({ categoryId: id, categoryName: `真实标签${id}`, accountingMode: 'manual_balance' as const,
    lifecycleStatus: 'active' as const, globalEnabled: false, override: { mode: 'follow_tag' as const, version: 0 }, participationStatus: lines.length ? 'participating' as const : 'none' as const,
    ineffectiveFundsCny: sumUserImpactCny(lines), status: 'ready' as const, notice: '', lines, ...patch });
  it('完整范围三数不变，排除名单为空', () => {
    expect(verifiedUserProfitsCny([category(1, [line(100, 80, 20)]), category(2, [line(-50, -45, -5)])], 15))
      .toEqual({ totalRawPnlCny: 50, totalCountedPnlCny: 35, profitPendingCount: 0, profitScope: 'complete', excludedProfitCategories: [], verifiedProfitImpactCny: 15, profitImpactMatchesTotal: true });
  });
  it('未知绝对获利但确知影响0，先显示其他已核验标签，两数差仍等于原总影响', () => {
    const result = verifiedUserProfitsCny([category(1, [line(100, 80, 20)]), category(2, [line(500, 500, 0)]), category(3, [line(null, null, 0)])], 20);
    expect(result).toMatchObject({ totalRawPnlCny: 600, totalCountedPnlCny: 580, profitPendingCount: 1, profitScope: 'verified_only', verifiedProfitImpactCny: 20, profitImpactMatchesTotal: true });
    expect(result.excludedProfitCategories.map(c => [c.categoryId, c.categoryName, c.lineCount])).toEqual([[3, '真实标签3', 1]]);
  });
  it('一笔缺证据即整标签排除，不把同标签其他已知笔藏进部分标签金额', () => {
    const result = verifiedUserProfitsCny([category(1, [line(100, 80, 20), line(null, null, 0)]), category(2, [line(300, 290, 10)])], 30);
    expect(result).toMatchObject({ totalRawPnlCny: 300, totalCountedPnlCny: 290, verifiedProfitImpactCny: 10, profitScope: 'verified_only', profitImpactMatchesTotal: false });
    expect(result.excludedProfitCategories[0]).toMatchObject({ categoryId: 1, lineCount: 2 });
  });
  it('未核验标签的影响也未知时，部分差额不冒充原完整影响', () => {
    const result = verifiedUserProfitsCny([category(1, [line(100, 80, 20)]), category(2, [line(null, null, null)], { status: 'pending' })], null);
    expect(result).toMatchObject({ totalRawPnlCny: 100, totalCountedPnlCny: 80, verifiedProfitImpactCny: 20, profitImpactMatchesTotal: false });
  });
  it('全部真实参与标签未核验，不能用未参与标签0伪造两个0总计', () => {
    expect(verifiedUserProfitsCny([category(1, [line(null, null, 0)]), category(2, [])], 0))
      .toMatchObject({ totalRawPnlCny: null, totalCountedPnlCny: null, verifiedProfitImpactCny: null, profitScope: 'verified_only', profitImpactMatchesTotal: false });
  });
  it('确知参与收益0可以显示0，但仍列明其他排除标签', () => {
    expect(verifiedUserProfitsCny([category(1, [line(0, 0, 0)]), category(2, [line(null, null, 0)])], 0))
      .toMatchObject({ totalRawPnlCny: 0, totalCountedPnlCny: 0, profitScope: 'verified_only', profitImpactMatchesTotal: true });
  });
  it('只有未参与标签可确定完整三个0，不列未参与为缺证据', () => {
    expect(verifiedUserProfitsCny([category(1, []), category(2, [])], 0))
      .toMatchObject({ totalRawPnlCny: 0, totalCountedPnlCny: 0, profitScope: 'complete', excludedProfitCategories: [], profitImpactMatchesTotal: true });
  });
  it('排除名单与已核验scope只取当前DTO，既不修改标签数据，也不修改全标签影响', () => {
    const categories = [category(1, [line(100, 80, 20)]), category(2, [line(null, null, 5)])];
    const original = JSON.stringify(categories);
    const result = verifiedUserProfitsCny(categories, 25);
    expect(result).toMatchObject({ verifiedProfitImpactCny: 20, profitImpactMatchesTotal: false });
    expect(JSON.stringify(categories)).toBe(original);
  });
  it('安全分值或对账损坏的整标签必须列入排除名单', () => {
    const result = verifiedUserProfitsCny([category(1, [line(100, 80, 21)]), category(2, [line(50, 50, 0)])], 21);
    expect(result).toMatchObject({ totalRawPnlCny: 50, totalCountedPnlCny: 50, verifiedProfitImpactCny: 0, profitImpactMatchesTotal: false });
    expect(result.excludedProfitCategories[0].categoryId).toBe(1);
  });
});
