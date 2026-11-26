import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const db = vi.hoisted(() => ({ get: vi.fn(), tx: vi.fn() }));
const ordinary = vi.hoisted(() => ({ read: vi.fn() }));
const fx = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: db.get, getDbTransactionConnection: db.tx }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: fx.get }));
// Spy on the real parent-owned SELECT/decode implementation, never its save mutation.
vi.mock('./ordinary-tag-downside-rules', async importOriginal => {
  const original = await importOriginal<typeof import('./ordinary-tag-downside-rules')>();
  ordinary.read.mockImplementation(original.readAllOrdinaryTagDownsideRules);
  return { ...original, readAllOrdinaryTagDownsideRules: ordinary.read };
});
import { getForcedLiquidationSettings, type ForcedLiquidationSettings } from './forced-liquidation-settings';
import { readAllStockLotDownsideRules, readStockLotDownsideRules } from './stock-lot-downside-rules';
import { latestStockLotDownsideRule } from '../shared/stock-lot-downside';

const input = { ledgerId: 37, userId: 7 };
const category = (id: number, mode = 'stock_portfolio', overrides: Record<string, unknown> = {}) => ({
  id, ledgerId: 37, parentId: null, isDefault: 0, name: `标签${id}`, accounting_mode: mode, sortOrder: id, ...overrides,
});
const lot = (id = 101, categoryId = 81, overrides: Record<string, unknown> = {}) => ({
  id, ledger_id: 37, category_id: categoryId, symbol: '600000.SH', stock_name: '浦发银行', opened_event_id: id + 1000,
  opened_at: '2026-11-20 09:35:16',
  initial_quantity: '100', unit_cost: '10.5', note: null as string | null, ...overrides,
});
const opening = (holding: ReturnType<typeof lot>, overrides: Record<string, unknown> = {}) => ({
  id: holding.opened_event_id, ledger_id: holding.ledger_id, category_id: holding.category_id, symbol: holding.symbol,
  status: 'active', event_type: 'buy', actual_traded_at: '2026-11-20 09:35:16', server_registered_at: '2026-11-21 14:00:00',
  quantity: holding.initial_quantity, execution_price: holding.unit_cost, note: '原始开仓备注', ...overrides,
});
const stored = (overrides: Record<string, unknown> = {}) => ({
  ledger_id: 37, category_id: 81, lot_id: 101, user_id: 7, version: 1, enabled: 1, threshold_price: '12.34',
  downside_percent: '20', effective_at: '2026-11-19T16:00:00.000Z', baseline_raw_price: '10.5', baseline_counted_price: '10.5',
  currency: 'CNY', quote_as_of: null, created_at: '2026-11-20T06:00:00.000Z', ...overrides,
});
const future = () => stored({ version: 4, enabled: 0, start_date: '2099-12-01', effective_at: '2099-11-30T16:00:00.000Z',
  baseline_raw_price: '74.23', baseline_counted_price: '74.23', threshold_price: '74.23', baseline_status: 'ready',
  baseline_source: 'owner_threshold', holding_start_at: '2026-11-20T09:35:16+08:00' });
const tagConfig = (categoryId = 81, overrides: Record<string, unknown> = {}) => ({
  ledger_id: 37, tag_name: `标签${categoryId}`, pause_date: null, margin_pause_date: null, end_date: null, ...overrides,
});
function fixture() {
  const initial = lot();
  const state = {
    owner: 7 as number | null,
    categories: [category(83, 'manual_balance'), category(82, 'stock_portfolio'), category(81, 'stock_portfolio')],
    lots: [initial],
    events: [opening(initial)] as any[],
    allocations: [] as { lot_id: number; event_id: number; quantity: unknown }[],
    stockRules: [] as any[], ordinaryRules: [] as any[],
    rawStockRows: null as any[] | null,
    tagConfigs: [] as any[], rawTagConfigRows: null as any[] | null,
    tagConfigError: null as Error | null, missingTagEndDate: null as Error | null, tagConfigFallbackError: null as Error | null,
    close: [] as any[], intraday: [] as any[], records: [] as any[],
    missingRules: false, missingOrdinaryRules: false, oldRulesSchema: false,
  };
  const conn = { execute: vi.fn(async (sql: string, params: any[] = []): Promise<any[]> => {
    if (!/^SELECT\b/.test(sql)) throw new Error('Unexpected mutation/DDL in owner settings');
    if (sql.includes('FROM ledgers ')) return [state.owner === null ? [] : [{ ownerId: state.owner }]];
    if (sql.includes('FROM ledger_categories WHERE')) {
      return [state.categories.filter(c => c.ledgerId === params[0] && c.parentId === null && c.isDefault === 0
        && ['stock_portfolio', 'manual_balance'].includes(c.accounting_mode as string))
        .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.id - b.id)];
    }
    if (sql.includes('FROM ledger_tag_config ')) {
      if (state.tagConfigError) throw state.tagConfigError;
      if (sql.includes('end_date') && state.missingTagEndDate) throw state.missingTagEndDate;
      if (!sql.includes('end_date') && state.tagConfigFallbackError) throw state.tagConfigFallbackError;
      const rows = state.rawTagConfigRows ?? state.tagConfigs.filter(r => r.ledger_id === params[0]);
      return [rows.map(r => sql.includes('end_date') ? r : { ledger_id: r.ledger_id, tag_name: r.tag_name,
        pause_date: r.pause_date, margin_pause_date: r.margin_pause_date })];
    }
    if (sql.includes('FROM ledger_ordinary_tag_downside_rules ')) {
      if (state.missingOrdinaryRules) throw Object.assign(new Error('missing ordinary table'), { errno: 1146 });
      return [state.ordinaryRules.map(r => ({ ledger_id: 37, category_id: r.categoryId, user_id: 7, version: r.version,
        enabled: r.enabled ? 1 : 0, threshold_amount: String(r.thresholdAmount), downside_percent: String(r.downsidePercent),
        start_date: r.startDate, created_at: '2026-11-25T06:00:00.000Z' }))];
    }
    if (sql.includes('FROM ledger_stock_lot_downside_rules ')) {
      if (state.missingRules) throw Object.assign(new Error('missing rule table'), { code: 'ER_NO_SUCH_TABLE' });
      if (state.oldRulesSchema && sql.includes('start_date')) throw Object.assign(new Error('old date schema'), { errno: 1054 });
      return [state.stockRules.filter(r => r.ledger_id === params[0] && (params.length < 2 || r.category_id === params[1]))];
    }
    if (sql.includes('FROM ledger_stock_price_snapshots ')) return [state.close];
    if (sql.includes('FROM ledger_stock_intraday_quotes ')) return [state.intraday];
    if (sql.includes('FROM ledger_records r')) return [state.records];
    if (sql.includes('FROM ledger_stock_lots l')) {
      if (state.rawStockRows !== null) return [state.rawStockRows];
      const rows: any[] = [];
      for (const l of state.lots) {
        const c = state.categories.find(c => c.id === l.category_id && c.ledgerId === l.ledger_id && c.parentId === null
          && c.isDefault === 0 && c.accounting_mode === 'stock_portfolio');
        const e = state.events.find(e => e.id === l.opened_event_id && e.ledger_id === l.ledger_id && e.category_id === l.category_id
          && e.status === 'active' && ['buy', 'add'].includes(e.event_type) && e.symbol === l.symbol);
        if (!c || !e || l.ledger_id !== params.at(-1)) continue;
        const allocated = state.allocations.filter(a => a.lot_id === l.id).reduce((sum, a) => {
          const sale = state.events.find(s => s.id === a.event_id && s.ledger_id === l.ledger_id && s.category_id === l.category_id
            && s.status === 'active' && ['reduce', 'sell'].includes(s.event_type));
          return sum + (sale ? Number(a.quantity) : 0);
        }, 0);
        const currentAllocated = state.allocations.filter(a => a.lot_id === l.id).reduce((sum, a) => {
          const sale = state.events.find(s => s.id === a.event_id && s.ledger_id === l.ledger_id && s.category_id === l.category_id
            && s.symbol === l.symbol && s.actual_traded_at <= params[0] && s.status === 'active' && ['reduce', 'sell'].includes(s.event_type));
          return sum + (sale ? Number(a.quantity) : 0);
        }, 0);
        rows.push({ ...l, opening_status: e.status, opening_event_type: e.event_type, actual_traded_at: e.actual_traded_at,
          note: l.note ?? e.note ?? '', allocated_quantity: allocated, current_allocated_quantity: currentAllocated });
      }
      rows.sort((a, b) => {
        const left = state.categories.find(c => c.id === a.category_id)!, right = state.categories.find(c => c.id === b.category_id)!;
        return Number(left.sortOrder) - Number(right.sortOrder) || left.id - right.id
          || String(a.opened_at).localeCompare(String(b.opened_at)) || a.id - b.id;
      });
      return [rows];
    }
    throw new Error('Unexpected SQL outside owner settings allowlist');
  }) };
  db.get.mockResolvedValue(conn);
  return { state, conn };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-26T01:00:00Z'));
  fx.get.mockReset().mockResolvedValue({ rate: 7, pair: 'USD/CNY', stale: false,
    source: 'sina_usdcny', asOf: '2026-11-26T00:59:59Z' });
});
afterEach(() => vi.mocked(Date.now).mockRestore());

describe('37号强平设置严格实际owner权限（离线SQL）', () => {
  it.each([
    { ...input, isViewingAs: true }, { ...input, ledgerId: 52, isViewingAs: true, systemRole: 'admin' },
  ])('代看在开头拒绝，零连接零SQL：%o', async request => {
    const { conn } = fixture();
    await expect(getForcedLiquidationSettings(request)).rejects.toThrow('代看');
    expect(db.get).not.toHaveBeenCalled(); expect(conn.execute).not.toHaveBeenCalled();
  });
  it.each([52, 0, -1, 37.5])('foreign ledger %s在连接前拒绝', async ledgerId => {
    const { conn } = fixture();
    await expect(getForcedLiquidationSettings({ ...input, ledgerId })).rejects.toThrow('37号');
    expect(db.get).not.toHaveBeenCalled(); expect(conn.execute).not.toHaveBeenCalled();
  });
  it.each([undefined, 'admin', 'super_admin', 'systemadmin', 'owner'])('nonowner role=%s只有owner SELECT，没有类别/股票/规则查询', async systemRole => {
    const { state, conn } = fixture(); state.owner = 8;
    await expect(getForcedLiquidationSettings({ ...input, systemRole })).rejects.toThrow('所有者');
    expect(conn.execute.mock.calls).toEqual([['SELECT ownerId FROM ledgers WHERE id=? LIMIT 1', [37]]]);
    expect(ordinary.read).not.toHaveBeenCalled(); expect(db.tx).not.toHaveBeenCalled();
  });
  it('缺少37号ledger owner时拒绝，不读规则', async () => {
    const { state, conn } = fixture(); state.owner = null;
    await expect(getForcedLiquidationSettings(input)).rejects.toThrow('所有者'); expect(conn.execute).toHaveBeenCalledTimes(1);
  });
  it.each([0, -1, NaN, 7.5])('无效用户%s不允许Number转换绕过owner', async userId => {
    const { conn } = fixture(); await expect(getForcedLiquidationSettings({ ...input, userId })).rejects.toThrow('所有者');
    expect(conn.execute).not.toHaveBeenCalled();
  });
  it('数据库不可用清晰报错，不启动事务', async () => {
    db.get.mockResolvedValue(null); await expect(getForcedLiquidationSettings(input)).rejects.toThrow('数据库连接不可用');
    expect(db.tx).not.toHaveBeenCalled();
  });
});

describe('中央批量分类与真实规则来源', () => {
  it('所有顶级非default分类按sortOrder/id；empty股票和普通标签保留，普通无保存规则为null', async () => {
    const { state, conn } = fixture();
    state.categories.push(category(84, 'stock_portfolio', { sortOrder: 0 }), category(85, 'manual_balance', { sortOrder: 0 }),
      category(86, 'manual_balance', { isDefault: 1 }), category(87, 'stock_portfolio', { parentId: 81 }),
      category(88, 'stock_portfolio', { ledgerId: 52 }));
    const result: ForcedLiquidationSettings = await getForcedLiquidationSettings({ ...input, systemRole: 'member' });
    expect(result).toMatchObject({ ledgerId: 37, canEdit: true });
    expect(result.categories.map(c => c.categoryId)).toEqual([84, 85, 81, 82, 83]);
    expect(result.categories.every(c => c.currency === 'CNY' && c.ordinaryRule === null)).toBe(true);
    expect(result.categories.find(c => c.categoryId === 82)?.stocks).toEqual([]);
    expect(result.categories.find(c => c.categoryId === 83)?.stocks).toEqual([]);
    expect(conn.execute).toHaveBeenCalledTimes(6); expect(ordinary.read).toHaveBeenCalledTimes(1);
    expect(conn.execute.mock.calls[0]?.[0]).toContain('SELECT ownerId FROM ledgers');
    expect(conn.execute.mock.calls[1]?.[0]).toContain('ORDER BY sortOrder,id');
  });
  it('普通真实store缺表返回空map，ordinaryRule仍null且仅一次普通batch SELECT', async () => {
    const { state, conn } = fixture(); state.missingOrdinaryRules = true;
    expect((await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 83)?.ordinaryRule).toBeNull();
    expect(conn.execute).toHaveBeenCalledTimes(6); expect(ordinary.read).toHaveBeenCalledTimes(1);
    expect(conn.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  it('100个类别/持仓仍只6次SELECT，无逐标签N+1', async () => {
    const { state, conn } = fixture();
    state.categories = Array.from({ length: 100 }, (_, i) => category(i + 1, i % 2 ? 'manual_balance' : 'stock_portfolio'));
    state.lots = state.categories.filter(c => c.accounting_mode === 'stock_portfolio').map(c => lot(100 + c.id, c.id));
    state.events = state.lots.map(l => opening(l));
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories).toHaveLength(100); expect(result.categories.flatMap(c => c.stocks)).toHaveLength(50);
    expect(conn.execute).toHaveBeenCalledTimes(6);
    expect(conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_tag_config '))).toHaveLength(1);
    expect(conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_stock_lots l'))).toHaveLength(1);
    expect(conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_stock_lot_downside_rules '))).toHaveLength(1);
  });
  it('没有普通类别不读普通规则：5次SELECT；完全空类别也不虚构数据', async () => {
    const { state, conn } = fixture(); state.categories = [category(81)];
    expect((await getForcedLiquidationSettings(input)).categories).toHaveLength(1);
    expect(conn.execute).toHaveBeenCalledTimes(5); expect(ordinary.read).not.toHaveBeenCalled();
    conn.execute.mockClear(); state.categories = [];
    expect((await getForcedLiquidationSettings(input)).categories).toEqual([]); expect(conn.execute).toHaveBeenCalledTimes(5);
  });
  it('普通账户规则独立batch最高future版本，stock不套普通规则、无saved普通保持null', async () => {
    const { state, conn } = fixture(); state.categories.push(category(84, 'manual_balance'));
    state.ordinaryRules = [
      { categoryId: 83, version: 1, enabled: true, thresholdAmount: 100, downsidePercent: 10, startDate: '2026-11-20' },
      { categoryId: 83, version: 3, enabled: false, thresholdAmount: 120, downsidePercent: 25, startDate: '2099-12-01' },
      { categoryId: 81, version: 8, enabled: true, thresholdAmount: 999, downsidePercent: 40, startDate: '2026-11-20' },
    ];
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories.find(c => c.categoryId === 83)?.ordinaryRule).toEqual({ version: 3, enabled: false,
      thresholdAmount: 120, downsidePercent: 25, startDate: '2099-12-01' });
    expect(result.categories.find(c => c.categoryId === 84)?.ordinaryRule).toBeNull();
    expect(result.categories.find(c => c.categoryId === 81)?.ordinaryRule).toBeNull();
    expect(conn.execute).toHaveBeenCalledTimes(6); expect(ordinary.read).toHaveBeenCalledWith(conn, 37);
  });
  it('中央列表和原stock row规则同store，最高future保存版本保留source/CAS和disabled，不按effectiveNow筛掉', async () => {
    const { state, conn } = fixture(); state.stockRules = [future(), stored(), stored({ version: 2 })];
    const result = await getForcedLiquidationSettings(input);
    const legacyRowRule = latestStockLotDownsideRule(await readStockLotDownsideRules(conn, 37, 81), 101);
    const rule = result.categories.find(c => c.categoryId === 81)?.stocks[0]?.currentDownsideRule;
    expect(rule).toEqual(legacyRowRule);
    expect(rule).toMatchObject({ version: 4, enabled: false, startDate: '2099-12-01', baselineSource: 'owner_threshold',
      thresholdPrice: 74.23, baselineRawPrice: 74.23, baselineCountedPrice: 74.23, quoteAsOf: undefined });
  });
  it('old规则不得转换为owner_threshold，按category/ledger/lot严格匹配，不复用foreign规则', async () => {
    const { state } = fixture(); state.stockRules = [stored({ baseline_source: 'verified_close' }),
      stored({ category_id: 82, version: 8 }), stored({ ledger_id: 52, version: 99 }), stored({ lot_id: 999, version: 99 })];
    const original = structuredClone(state.stockRules);
    const rule = (await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 81)?.stocks[0]?.currentDownsideRule;
    expect(rule).toMatchObject({ version: 1, baselineSource: 'verified_close', baselineRawPrice: 10.5, thresholdPrice: 12.34 });
    expect(state.stockRules).toEqual(original);
  });
  it('全ledger helper不受旧category缓存影响；重复中央read仍read新版本', async () => {
    const { state, conn } = fixture(); state.stockRules = [stored()];
    await readStockLotDownsideRules(conn, 37, 81);
    state.stockRules.push(future()); conn.execute.mockClear();
    expect((await getForcedLiquidationSettings(input)).categories[0]?.stocks[0]?.currentDownsideRule?.version).toBe(4);
    state.stockRules.push(stored({ version: 5 }));
    expect((await getForcedLiquidationSettings(input)).categories[0]?.stocks[0]?.currentDownsideRule?.version).toBe(5);
    expect(conn.execute).toHaveBeenCalledTimes(14);
    expect((await readStockLotDownsideRules(conn, 37, 81))[0]?.version).toBe(1); // Existing cache policy remains untouched.
  });
});

describe('账本真实全局标签生命周期（不读取个人配置）', () => {
  it('owner授权后仅一次ledger batch SELECT，按标签精确匹配并保留原排序和规则', async () => {
    const { state, conn } = fixture(); state.stockRules = [future()];
    state.tagConfigs = [tagConfig(81, { margin_pause_date: '2026-11-25', pause_date: '2026-11-20' }),
      tagConfig(83, { end_date: '2026-11-24', margin_pause_date: '2026-11-25' }),
      tagConfig(82, { ledger_id: 52, end_date: '2026-11-20' }), tagConfig(999, { end_date: '2026-11-20' })];
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories.map(c => [c.categoryId, c.lifecycleStatus, c.lifecycleDate])).toEqual([
      [81, 'paused', '2026-11-25'], [82, 'active', null], [83, 'ended', '2026-11-24'],
    ]);
    expect(result.categories[0]?.stocks[0]?.currentDownsideRule).toMatchObject({ version: 4, baselineSource: 'owner_threshold' });
    expect(conn.execute.mock.calls[0]).toEqual(['SELECT ownerId FROM ledgers WHERE id=? LIMIT 1', [37]]);
    const calls = conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_tag_config '));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([expect.stringContaining('WHERE ledger_id=?'), [37]]);
    expect(calls[0]?.[0]).toContain('SELECT ledger_id,tag_name,pause_date,margin_pause_date,end_date');
    expect(calls[0]?.[0]).not.toMatch(/SELECT \*|initial_balances|user_id|history|FOR UPDATE|LIMIT/);
  });
  it('即使db异常返回foreign row也再次ledger过滤，标签名不做宽松或模糊匹配', async () => {
    const { state } = fixture(); state.rawTagConfigRows = [
      tagConfig(81, { ledger_id: 52, end_date: '2026-11-20' }),
      tagConfig(82, { tag_name: ' 标签82 ', margin_pause_date: '2026-11-20' }),
      tagConfig(83, { tag_name: 83, pause_date: '2026-11-20' }),
    ];
    expect((await getForcedLiquidationSettings(input)).categories.every(c => c.lifecycleStatus === 'active' && c.lifecycleDate === null)).toBe(true);
  });
  it.each([
    { pause_date: '2026-11-20' }, { margin_pause_date: '2026-11-20' },
    { pause_date: '2026-11-19', margin_pause_date: '2026-11-20' },
  ])('37全局暂停使用margin_pause_date ?? pause_date：%o', async overrides => {
    const { state } = fixture(); state.tagConfigs = [tagConfig(83, overrides)];
    expect((await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 83))
      .toMatchObject({ lifecycleStatus: 'paused', lifecycleDate: '2026-11-20' });
  });
  it('清空两全局暂停字段即恢复，每次重新SELECT，其他字段或个人history不反向暂停', async () => {
    const { state, conn } = fixture(); state.tagConfigs = [tagConfig(83, { pause_date: '2026-11-20', margin_pause_date: '2026-11-20',
      initial_balances: { '7': { __pauseDate: '2026-11-20', history: [{ pauseDate: '2026-11-20' }] } } })];
    expect((await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 83)?.lifecycleStatus).toBe('paused');
    state.tagConfigs[0].pause_date = null; state.tagConfigs[0].margin_pause_date = null;
    expect((await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 83))
      .toMatchObject({ lifecycleStatus: 'active', lifecycleDate: null });
    expect(conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_tag_config '))).toHaveLength(2);
    expect(conn.execute.mock.calls.every(([sql]) => !sql.includes('initial_balances'))).toBe(true);
  });
  it('有效end_date优先全局暂停；future end不生效但不会阻止已生效暂停', async () => {
    const { state } = fixture(); state.tagConfigs = [
      tagConfig(81, { end_date: '2026-11-26', margin_pause_date: '2026-11-20' }),
      tagConfig(83, { end_date: '2026-11-27', margin_pause_date: '2026-11-20' }),
    ];
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories[0]).toMatchObject({ lifecycleStatus: 'ended', lifecycleDate: '2026-11-26' });
    expect(result.categories[0]?.stocks).toHaveLength(1); // Global status is presentation metadata, not a holdings mutation.
    expect(result.categories.find(c => c.categoryId === 83)).toMatchObject({ lifecycleStatus: 'paused', lifecycleDate: '2026-11-20' });
  });
  it('北京日界按+08:00明确生效，不以UTC日或服务器时区误判', async () => {
    const { state } = fixture(); state.tagConfigs = [tagConfig(81, { end_date: '2026-11-26' }),
      tagConfig(83, { margin_pause_date: '2026-11-26' })];
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-25T15:59:59Z'));
    expect((await getForcedLiquidationSettings(input)).categories.every(c => c.lifecycleStatus === 'active')).toBe(true);
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-25T16:00:00Z'));
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories[0]).toMatchObject({ lifecycleStatus: 'ended', lifecycleDate: '2026-11-26' });
    expect(result.categories.find(c => c.categoryId === 83)).toMatchObject({ lifecycleStatus: 'paused', lifecycleDate: '2026-11-26' });
  });
  it.each(['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-11-00', '2026-11-27',
    '2099-01-01', '2026-1-01', '2026-11-20T00:00:00Z', ' 2026-11-20', '', 'invalid', null, 20261120,
    new Date('2026-11-20T00:00:00Z')])('end和pause只接受严格有效非未来YYYY-MM-DD：%o', async date => {
    const { state } = fixture(); state.tagConfigs = [tagConfig(83, { end_date: date, margin_pause_date: date })];
    expect((await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 83))
      .toMatchObject({ lifecycleStatus: 'active', lifecycleDate: null });
  });
  it('有效闰日接受；非null margin日期即使future/空字符串也不错误回退旧pause_date', async () => {
    const { state } = fixture(); state.tagConfigs = [tagConfig(81, { end_date: '2024-02-29' }),
      tagConfig(82, { pause_date: '2026-11-20', margin_pause_date: '' }),
      tagConfig(83, { pause_date: '2026-11-20', margin_pause_date: '2026-11-27' })];
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories[0]).toMatchObject({ lifecycleStatus: 'ended', lifecycleDate: '2024-02-29' });
    expect(result.categories.slice(1).every(c => c.lifecycleStatus === 'active' && c.lifecycleDate === null)).toBe(true);
  });
  it.each([{ code: 'ER_NO_SUCH_TABLE' }, { errno: 1146 }])('确实缺表%o安全兼容但无负缓存，每次重新SELECT', async details => {
    const { state, conn } = fixture(); state.tagConfigError = Object.assign(new Error('missing tag table'), details);
    expect((await getForcedLiquidationSettings(input)).categories.every(c => c.lifecycleStatus === 'active')).toBe(true);
    state.tagConfigError = null; state.tagConfigs = [tagConfig(83, { margin_pause_date: '2026-11-20' })];
    expect((await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 83)?.lifecycleStatus).toBe('paused');
    expect(conn.execute).toHaveBeenCalledTimes(12);
  });
  it.each([{ code: 'ER_BAD_FIELD_ERROR' }, { errno: 1054 }])('仅精确缺end_date %o多一次ledger SELECT保留真实暂停', async details => {
    const { state, conn } = fixture(); state.missingTagEndDate = Object.assign(new Error("Unknown column 'end_date' in 'field list'"), details);
    state.tagConfigs = [tagConfig(83, { pause_date: '2026-11-20', end_date: '2026-11-21' })];
    expect((await getForcedLiquidationSettings(input)).categories.find(c => c.categoryId === 83))
      .toMatchObject({ lifecycleStatus: 'paused', lifecycleDate: '2026-11-20' });
    const calls = conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_tag_config '));
    expect(calls).toHaveLength(2); expect(conn.execute).toHaveBeenCalledTimes(7);
    expect(calls.every(([sql, params]) => /^SELECT/.test(sql) && JSON.stringify(params) === '[37]' && sql.includes('WHERE ledger_id=?'))).toBe(true);
    expect(calls[0]?.[0]).toContain('end_date'); expect(calls[1]?.[0]).not.toContain('end_date');
  });
  it('mysql sqlMessage也仅精确end_date fallback；fallback后确实缺表可兼容', async () => {
    const { state, conn } = fixture(); state.missingTagEndDate = Object.assign(new Error('driver wrapper'),
      { code: 'ER_BAD_FIELD_ERROR', sqlMessage: "Unknown column 'ledger_tag_config.end_date' in 'field list'" });
    state.tagConfigFallbackError = Object.assign(new Error('missing table'), { errno: 1146 });
    expect((await getForcedLiquidationSettings(input)).categories.every(c => c.lifecycleStatus === 'active')).toBe(true);
    expect(conn.execute).toHaveBeenCalledTimes(7);
  });
  it.each([
    new Error('connection failed'), Object.assign(new Error('permission denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' }),
    Object.assign(new Error("Unknown column 'margin_pause_date' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR' }),
    Object.assign(new Error("Unknown column 'pause_date' in 'field list'"), { errno: 1054 }),
    Object.assign(new Error("Unknown column 'ledger_id' in 'field list'"), { errno: 1054 }),
    Object.assign(new Error('end_date generic query failed'), { errno: 1054 }),
    Object.assign(new Error("Unknown column 'other_end_date' in 'field list'"), { errno: 1054 }),
  ])('真实查询失败或非精准字段缺失必须抛出，不能假active：%o', async error => {
    const { state, conn } = fixture(); state.tagConfigError = error;
    await expect(getForcedLiquidationSettings(input)).rejects.toBe(error);
    expect(conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_tag_config '))).toHaveLength(1);
    expect(ordinary.read).not.toHaveBeenCalled(); expect(db.tx).not.toHaveBeenCalled();
  });
  it('缺end_date fallback中的真实错误仍抛出，不吞为假active', async () => {
    const { state, conn } = fixture(); state.missingTagEndDate = Object.assign(new Error("Unknown column 'end_date' in 'field list'"), { errno: 1054 });
    const error = Object.assign(new Error("Unknown column 'margin_pause_date' in 'field list'"), { errno: 1054 });
    state.tagConfigFallbackError = error;
    await expect(getForcedLiquidationSettings(input)).rejects.toBe(error);
    expect(conn.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_tag_config '))).toHaveLength(2);
  });
});

describe('真实开仓、sale作用域和quantity保护', () => {
  it('摘要current allocation精确同symbol且截至同now，future/foreign sale不侵入；原listremaining/真实编号不改', async () => {
    const { state, conn } = fixture(); state.stockRules = [stored({ start_date: '2026-11-20', threshold_price: 10,
      baseline_source: 'verified_close', baseline_status: 'pending' })];
    state.close = [{ ledger_id: 37, category_id: 81, symbol: '600000.SH', price: 8,
      price_date: '2026-11-25', captured_at: '2026-11-25 15:05:00.000000' }];
    state.events.push(
      { id: 201, ledger_id: 37, category_id: 81, symbol: '600000.SH', status: 'active', event_type: 'sell', actual_traded_at: '2026-11-25 12:00:00' },
      { id: 202, ledger_id: 37, category_id: 81, symbol: '600000.SH', status: 'active', event_type: 'sell', actual_traded_at: '2026-11-26 09:00:01' },
      { id: 203, ledger_id: 37, category_id: 81, symbol: 'MSFT', status: 'active', event_type: 'reduce', actual_traded_at: '2026-11-25 12:00:00' },
      { id: 204, ledger_id: 52, category_id: 81, symbol: '600000.SH', status: 'active', event_type: 'sell', actual_traded_at: '2026-11-25 12:00:00' },
      { id: 205, ledger_id: 37, category_id: 82, symbol: '600000.SH', status: 'active', event_type: 'sell', actual_traded_at: '2026-11-25 12:00:00' },
      { id: 206, ledger_id: 37, category_id: 81, symbol: '600000.SH', status: 'voided', event_type: 'sell', actual_traded_at: '2026-11-25 12:00:00' },
    );
    state.allocations = [201, 202, 203, 204, 205, 206].map(event_id => ({ lot_id: 101, event_id, quantity: 10 }));
    const c = (await getForcedLiquidationSettings(input)).categories[0]!, stock = c.stocks[0]!;
    expect(stock).toMatchObject({ remainingQuantity: 70, quantity: 100, positionNumber: '01', ineffectiveFunds: 144, ineffectiveStatus: 'ready' });
    expect(c.ineffectiveFunds).toBe(144); expect(conn.execute).toHaveBeenCalledTimes(8);
    const query = conn.execute.mock.calls.find(([sql]) => sql.includes('FROM ledger_stock_lots l'))!;
    expect(query[0]).toContain('sale.symbol=l.symbol'); expect(query[0]).toContain('sale.actual_traded_at<=?');
    expect(query[1]).toEqual(['2026-11-26 09:00:00', 37]);
  });
  it('原始quantity不变，remaining仅扣active同ledger同category sale；不扣void/foreign/ordinary event', async () => {
    const { state, conn } = fixture();
    state.events.push(...[
      { id: 201, ledger_id: 37, category_id: 81, status: 'active', event_type: 'reduce' },
      { id: 202, ledger_id: 37, category_id: 81, status: 'voided', event_type: 'sell' },
      { id: 203, ledger_id: 52, category_id: 81, status: 'active', event_type: 'sell' },
      { id: 204, ledger_id: 37, category_id: 82, status: 'active', event_type: 'sell' },
      { id: 205, ledger_id: 37, category_id: 81, status: 'active', event_type: 'note' },
    ]);
    state.allocations = [201, 202, 203, 204, 205].map(id => ({ lot_id: 101, event_id: id, quantity: 40 }));
    const stock = (await getForcedLiquidationSettings(input)).categories[0]?.stocks[0];
    expect(stock).toMatchObject({ lotId: 101, eventId: 1101, quantity: 100, remainingQuantity: 60, executionPrice: 10.5,
      actualTradedAt: '2026-11-20T09:35:16+08:00', note: '原始开仓备注', currentDownsideRule: null });
    const sql = conn.execute.mock.calls.find(([s]) => s.includes('FROM ledger_stock_lots l'))?.[0] ?? '';
    for (const required of ['category.ledgerId=l.ledger_id', 'category.parentId IS NULL', 'category.isDefault=0',
      "category.accounting_mode='stock_portfolio'", 'opening.ledger_id=l.ledger_id', 'opening.category_id=l.category_id',
      "opening.status='active'", "opening.event_type IN ('buy','add')", 'opening.symbol=l.symbol',
      "sale.status='active'", 'sale.ledger_id=l.ledger_id', 'sale.category_id=l.category_id', "sale.event_type IN ('reduce','sell')",
      'WHERE l.ledger_id=?', "DATE_FORMAT(opening.actual_traded_at,'%Y-%m-%d %H:%i:%s')", "COALESCE(l.note,opening.note,'')"])
      expect(sql).toContain(required);
    expect(sql).not.toContain('server_registered_at');
  });
  it('closed/void opening/foreign ledger/mismatched category/ordinary stock不返回可编辑股票', async () => {
    const { state } = fixture();
    const closed = state.lots[0]!;
    state.events.push({ id: 201, ledger_id: 37, category_id: 81, status: 'active', event_type: 'sell' });
    state.allocations.push({ lot_id: closed.id, event_id: 201, quantity: 100 });
    const hidden = [lot(102), lot(103), lot(104), lot(105, 83), lot(106, 81, { ledger_id: 52 }), lot(107)];
    state.lots.push(...hidden);
    state.events.push(opening(hidden[0]!, { status: 'voided' }), opening(hidden[1]!, { category_id: 82 }),
      opening(hidden[2]!, { ledger_id: 52 }), opening(hidden[3]!), opening(hidden[4]!), opening(hidden[5]!, { event_type: 'note' }));
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories.flatMap(c => c.stocks)).toEqual([]);
    expect(result.categories[0]).toMatchObject({ lifecycleStatus: 'ended', lifecycleDate: null });
    expect(result.categories.slice(1).every(c => c.lifecycleStatus === 'active')).toBe(true);
  });
  it.each([100, 101])('只有真实有效已闭仓批次allocated=%s，类别推断ended但不添加历史可编辑stocks', async allocated => {
    const { state, conn } = fixture();
    state.rawStockRows = [{ ...lot(), opening_status: 'active', opening_event_type: 'buy', allocated_quantity: allocated }];
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories[0]).toMatchObject({ lifecycleStatus: 'ended', lifecycleDate: null, stocks: [] });
    expect(result.categories.slice(1).every(c => c.lifecycleStatus === 'active')).toBe(true);
    expect(conn.execute).toHaveBeenCalledTimes(6);
  });
  it('多个有效批次全闭仓才ended；只要仍有真实剩余批次就保持active并仅返回剩余批次', async () => {
    const { state } = fixture();
    state.rawStockRows = [101, 102].map(id => ({ ...lot(id), opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 100 }));
    expect((await getForcedLiquidationSettings(input)).categories[0]).toMatchObject({ lifecycleStatus: 'ended', stocks: [] });
    state.rawStockRows[1].allocated_quantity = 40;
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories[0]).toMatchObject({ lifecycleStatus: 'active', lifecycleDate: null });
    expect(result.categories[0]?.stocks).toMatchObject([{ lotId: 102, remainingQuantity: 60 }]);
  });
  it('完全闭仓优先暂停，真实end_date优先推断且保留结束日期；恢复开仓后读回paused', async () => {
    const { state } = fixture(); state.tagConfigs = [tagConfig(81, { pause_date: '2026-11-20' })];
    state.rawStockRows = [{ ...lot(), opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 100 }];
    expect((await getForcedLiquidationSettings(input)).categories[0]).toMatchObject({ lifecycleStatus: 'ended', lifecycleDate: null });
    state.tagConfigs[0].end_date = '2026-11-24';
    expect((await getForcedLiquidationSettings(input)).categories[0]).toMatchObject({ lifecycleStatus: 'ended', lifecycleDate: '2026-11-24' });
    state.tagConfigs[0].end_date = null; state.rawStockRows[0].allocated_quantity = 0;
    expect((await getForcedLiquidationSettings(input)).categories[0]).toMatchObject({ lifecycleStatus: 'paused', lifecycleDate: '2026-11-20' });
  });
  it('新建无持仓标签、只void开仓标签不推断已结束', async () => {
    const { state } = fixture(); state.events[0].status = 'voided';
    expect((await getForcedLiquidationSettings(input)).categories.every(c => c.lifecycleStatus === 'active' && c.lifecycleDate === null && c.stocks.length === 0)).toBe(true);
    state.lots = []; state.events = [];
    expect((await getForcedLiquidationSettings(input)).categories.every(c => c.lifecycleStatus === 'active')).toBe(true);
  });
  it.each([{ opening_status: 'voided' }, { opening_event_type: 'error' }, { unit_cost: null }, { unit_cost: 0 },
    { unit_cost: 'invalid' }, { initial_quantity: null }, { initial_quantity: 0 }, { id: 0 }, { opened_event_id: 0 },
    { ledger_id: 52 }, { category_id: 83 }, { symbol: 'CRYPTO:BTC-USDT', initial_quantity: 1e-9 }])
  ('异常/无效行情闭仓行不当真实结束依据：%o', async overrides => {
    const { state } = fixture(); state.rawStockRows = [{ ...lot(), opening_status: 'active', opening_event_type: 'buy',
      allocated_quantity: 100, ...overrides }];
    expect((await getForcedLiquidationSettings(input)).categories.every(c => c.lifecycleStatus === 'active' && c.stocks.length === 0)).toBe(true);
  });
  it('股票工具空仓epsilon不等于实际全卖；混有微小未售残余时不能推断全闭仓', async () => {
    const { state } = fixture(); state.rawStockRows = [
      { ...lot(), opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 100 },
      { ...lot(102, 81, { initial_quantity: '0.00000001' }), opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 0 },
    ];
    expect((await getForcedLiquidationSettings(input)).categories[0]).toMatchObject({ lifecycleStatus: 'active', lifecycleDate: null, stocks: [] });
  });
  it('数字币最小1e-8不当空仓，3e-8扣2e-8精度稳定，股票同1e-8按原工具空仓', async () => {
    const { state } = fixture();
    state.lots = [lot(101, 81, { symbol: 'CRYPTO:BTC-USDT', initial_quantity: '0.00000003' }),
      lot(102, 81, { initial_quantity: '0.00000001' })]; state.events = state.lots.map(l => opening(l));
    state.events.push({ id: 201, ledger_id: 37, category_id: 81, status: 'active', event_type: 'sell' });
    state.allocations = [{ lot_id: 101, event_id: 201, quantity: '0.00000002' }];
    expect((await getForcedLiquidationSettings(input)).categories[0]?.stocks).toMatchObject([
      { lotId: 101, quantity: 3e-8, remainingQuantity: 1e-8 },
    ]);
  });
  it.each([
    { initial_quantity: null }, { initial_quantity: 'invalid' }, { initial_quantity: 0 }, { initial_quantity: -1 },
    { initial_quantity: Infinity }, { allocated_quantity: NaN }, { allocated_quantity: -1 }, { allocated_quantity: 101 },
    { unit_cost: null }, { unit_cost: -1 }, { unit_cost: Infinity }, { opened_event_id: 0 }, { id: 1.5 },
    { symbol: 'CRYPTO:BTC-USDT', initial_quantity: 1e-9 }, { symbol: 'CRYPTO:BTC-USDT', initial_quantity: 0.123456789 },
    { symbol: 'CRYPTO:BTC-USDT', allocated_quantity: 1e-9 }, { opening_status: 'voided' }, { ledger_id: 52 },
  ])('异常quantity/price/来源不冒充可编辑存量：%o', async overrides => {
    const { state } = fixture();
    state.rawStockRows = [{ ...lot(), opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 0,
      actual_traded_at: '2026-11-20 09:35:16', ...overrides }];
    expect((await getForcedLiquidationSettings(input)).categories[0]?.stocks).toEqual([]);
  });
  it('lot note优先、空字符串不回退；unknown actual不以登记时间填充', async () => {
    const { state } = fixture(); state.lots[0]!.note = ''; state.events[0].actual_traded_at = null;
    const stock = (await getForcedLiquidationSettings(input)).categories[0]?.stocks[0];
    expect(stock).toMatchObject({ note: '', actualTradedAt: '' });
  });
  it('没有行情/钱包/参与名单、DDL或保存mutation；内存原始订单和旧rules未改', async () => {
    const { state, conn } = fixture(); state.stockRules = [stored({ enabled: 0 })];
    const before = structuredClone(state);
    await getForcedLiquidationSettings(input);
    expect(state).toEqual(before); expect(db.tx).not.toHaveBeenCalled();
    for (const [sql] of conn.execute.mock.calls) {
      expect(sql).toMatch(/^SELECT/);
      expect(sql).not.toMatch(/(?:FROM|JOIN)\s+\w*(?:quote|wallet|participation|ledger_members|initial_balances)|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i);
    }
    const source = readFileSync(new URL('./forced-liquidation-settings.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"].*(?:ledger-stock-portfolio|routers|price-scanner|crypto-portfolio-quotes|wallet|backend\/index)/);
  });
});

describe('全账本stock规则helper复用store decode与兼容（无cache/DDL）', () => {
  it('一次ledger/version batch解码原币种、业务日期、source和NaN pending，无active时间条件', async () => {
    const conn = { execute: vi.fn(async (_sql: string, _params: unknown[]) => [[future(), stored({ lot_id: 102,
      currency: 'USDT', baseline_raw_price: null, baseline_counted_price: null, baseline_status: 'pending' })]]) };
    const rules = await readAllStockLotDownsideRules(conn, 37);
    expect(rules[0]).toMatchObject({ ledgerId: 37, categoryId: 81, lotId: 101, userId: 7, version: 4, enabled: false,
      startDate: '2099-12-01', baselineSource: 'owner_threshold', baselineStatus: 'ready', baselineRawPrice: 74.23,
      baselineCountedPrice: 74.23, holdingStartAt: '2026-11-20T09:35:16+08:00' });
    expect(rules[1]?.currency).toBe('USDT'); expect(rules[1]?.baselineRawPrice).toBeNaN();
    expect(conn.execute).toHaveBeenCalledTimes(1);
    expect(conn.execute.mock.calls[0]).toEqual([expect.stringContaining('WHERE ledger_id=? ORDER BY category_id,lot_id,version'), [37]]);
    expect(conn.execute.mock.calls[0]?.[0]).not.toMatch(/effective_at\s*[<>=]|FOR UPDATE|LIMIT|CREATE|ALTER/);
  });
  it.each([{ code: 'ER_NO_SUCH_TABLE' }, { errno: 1146 }])('missing table %o返回[]；重复仍SELECT，无negative cache', async error => {
    const conn = { execute: vi.fn(async (_sql: string, _params: unknown[]) => { throw Object.assign(new Error('missing'), error); }) };
    expect(await readAllStockLotDownsideRules(conn, 37)).toEqual([]);
    expect(await readAllStockLotDownsideRules(conn, 37)).toEqual([]);
    expect(conn.execute).toHaveBeenCalledTimes(2); expect(conn.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  it.each([{ code: 'ER_BAD_FIELD_ERROR' }, { errno: 1054 }])('缺日期列%o仅fallback SELECT保留旧来源，不转换旧规则', async error => {
    const conn = { execute: vi.fn(async (sql: string, _params: unknown[]) => {
      if (sql.includes('start_date')) throw Object.assign(new Error('old columns'), error);
      return [[stored()]];
    }) };
    const rules = await readAllStockLotDownsideRules(conn, 37);
    expect(rules[0]).toMatchObject({ version: 1, baselineRawPrice: 10.5, baselineCountedPrice: 10.5,
      effectiveAt: '2026-11-19T16:00:00.000Z', baselineSource: undefined });
    expect(rules[0]?.startDate).toBeUndefined();
    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.execute.mock.calls.every(([sql, params]) => /^SELECT/.test(sql) && JSON.stringify(params) === '[37]')).toBe(true);
    expect(conn.execute.mock.calls[1]?.[0]).not.toContain('start_date');
  });
  it('不可隐藏真实SQL错误；fallback后missingtable仍[]', async () => {
    const conn = { execute: vi.fn(async (_sql: string, _params: unknown[]) => { throw new Error('connection failed'); }) };
    await expect(readAllStockLotDownsideRules(conn, 37)).rejects.toThrow('connection failed');
    const old = { execute: vi.fn(async (sql: string, _params: unknown[]) => {
      throw Object.assign(new Error('missing'), sql.includes('start_date') ? { errno: 1054 } : { errno: 1146 });
    }) };
    expect(await readAllStockLotDownsideRules(old, 37)).toEqual([]); expect(old.execute).toHaveBeenCalledTimes(2);
  });
  it('中央missingtable正常6SELECT，old schema仅额外1SELECT，不DDL', async () => {
    const { state, conn } = fixture(); state.missingRules = true;
    expect((await getForcedLiquidationSettings(input)).categories[0]?.stocks[0]?.currentDownsideRule).toBeNull();
    expect(conn.execute).toHaveBeenCalledTimes(6); conn.execute.mockClear();
    state.missingRules = false; state.oldRulesSchema = true; state.stockRules = [stored()];
    expect((await getForcedLiquidationSettings(input)).categories[0]?.stocks[0]?.currentDownsideRule?.version).toBe(1);
    expect(conn.execute).toHaveBeenCalledTimes(9); expect(conn.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
});

/** Reference the old getActiveLots -> buildPortfolio -> positions.flatMap useMemo path, without importing its backend. */
function originalPageNumbers(activeLots: ReturnType<typeof lot>[]): [number, string][] {
  const positions = new Map<string, { lots: ReturnType<typeof lot>[] }>();
  for (const holding of [...activeLots].sort((a, b) => a.opened_at.localeCompare(b.opened_at) || a.id - b.id)) {
    const position = positions.get(holding.symbol) || { lots: [] };
    position.lots.push(holding); positions.set(holding.symbol, position);
  }
  let positionNumber = 0;
  return Array.from(positions.values()).flatMap(position => position.lots.map(holding => {
    positionNumber += 1;
    return [holding.id, String(positionNumber).padStart(2, '0')] as [number, string];
  }));
}

describe('与原阿姨页一致的逐lot持仓编号（完整active列表先编号）', () => {
  it('集中SELECT同批DATE_FORMAT真实l.opened_at，以opened_at/id排序而非opening实际时间或lotId编号', async () => {
    const { conn } = fixture();
    const stock = (await getForcedLiquidationSettings(input)).categories[0]?.stocks[0];
    expect(stock).toMatchObject({ lotId: 101, positionNumber: '01', quantity: 100,
      actualTradedAt: '2026-11-20T09:35:16+08:00' });
    const sql = conn.execute.mock.calls.find(([s]) => s.includes('FROM ledger_stock_lots l'))?.[0] ?? '';
    expect(sql).toContain("DATE_FORMAT(l.opened_at,'%Y-%m-%d %H:%i:%s') AS opened_at");
    expect(sql).toContain('ORDER BY category.sortOrder,category.id,l.opened_at ASC,l.id ASC');
    expect(sql).not.toMatch(/ORDER BY[^\n]*opening\.actual_traded_at/);
    expect(conn.execute).toHaveBeenCalledTimes(6);
  });

  it('交错symbol先按opened_at/id建立首次出现分组，再展开编号，与原页reference完全一致', async () => {
    const { state, conn } = fixture();
    state.lots = [
      lot(701, 81, { symbol: 'B', stock_name: '乙', opened_at: '2026-11-20 09:32:00' }),
      lot(900, 81, { symbol: 'A', stock_name: '甲', opened_at: '2026-11-20 09:30:00' }),
      lot(100, 81, { symbol: 'A', stock_name: '甲', opened_at: '2026-11-20 09:33:00' }),
      lot(702, 81, { symbol: 'C', stock_name: '丙', opened_at: '2026-11-20 09:32:00' }),
      lot(500, 81, { symbol: 'B', stock_name: '乙', opened_at: '2026-11-20 09:31:00' }),
    ];
    // Actual trade times deliberately conflict with l.opened_at ordering; they must remain display data only.
    state.events = state.lots.map((l, index) => opening(l, { actual_traded_at: `2026-11-19 09:3${index}:00` }));
    const stocks = (await getForcedLiquidationSettings(input)).categories[0]!.stocks;
    expect(stocks.map(s => [s.lotId, s.positionNumber])).toEqual(originalPageNumbers(state.lots));
    expect(stocks.map(s => [s.lotId, s.positionNumber])).toEqual([
      [900, '01'], [100, '02'], [500, '03'], [701, '04'], [702, '05'],
    ]);
    expect(stocks.find(s => s.lotId === 100)?.actualTradedAt).toBe('2026-11-19T09:32:00+08:00');
    expect(conn.execute).toHaveBeenCalledTimes(6);
  });

  it('opened_at同秒真实id升序且不依赖异常返回顺序，原始SQL rows不被修改', async () => {
    const { state } = fixture();
    const holdings = [lot(910, 81, { symbol: 'Z' }), lot(210, 81, { symbol: 'A' }), lot(810, 81, { symbol: 'A' })];
    state.rawStockRows = holdings.map(l => ({ ...l, opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 0 }));
    const before = structuredClone(state.rawStockRows);
    const stocks = (await getForcedLiquidationSettings(input)).categories[0]!.stocks;
    expect(stocks.map(s => [s.lotId, s.positionNumber])).toEqual(originalPageNumbers(holdings));
    expect(stocks.map(s => s.lotId)).toEqual([210, 810, 910]);
    expect(state.rawStockRows).toEqual(before);
  });

  it('同name/code不同lot不合一，symbol相同名称变更仍按symbol组，每lot剩余量/开仓量/价格/日期/备注/规则独立保留', async () => {
    const { state } = fixture();
    state.lots = [lot(402, 81, { stock_name: '更名后浦发', initial_quantity: '250', unit_cost: '12.75', note: '',
      opened_at: '2026-11-20 10:00:00' }),
    lot(401, 81, { note: '批次401备注', opened_at: '2026-11-20 09:00:00' })];
    state.events = [opening(state.lots[0]!, { actual_traded_at: '2026-11-18 14:00:00', note: '不可覆盖空备注' }),
      opening(state.lots[1]!, { actual_traded_at: '2026-11-17 13:00:00' }),
      { id: 901, ledger_id: 37, category_id: 81, status: 'active', event_type: 'sell' }];
    state.allocations = [{ lot_id: 401, event_id: 901, quantity: 20 }, { lot_id: 402, event_id: 901, quantity: 75 }];
    state.stockRules = [stored({ lot_id: 402, version: 3 })];
    const stocks = (await getForcedLiquidationSettings(input)).categories[0]!.stocks;
    expect(stocks).toHaveLength(2);
    expect(stocks[0]).toMatchObject({ lotId: 401, eventId: 1401, positionNumber: '01', stockName: '浦发银行',
      quantity: 100, remainingQuantity: 80, executionPrice: 10.5, note: '批次401备注',
      actualTradedAt: '2026-11-17T13:00:00+08:00', currentDownsideRule: null });
    expect(stocks[1]).toMatchObject({ lotId: 402, eventId: 1402, positionNumber: '02', stockName: '更名后浦发',
      quantity: 250, remainingQuantity: 175, executionPrice: 12.75, note: '',
      actualTradedAt: '2026-11-18T14:00:00+08:00', currentDownsideRule: { lotId: 402, version: 3 } });
  });

  it('相同股票名但不同真实symbol独立分组，代码不trim/归一化/按名称误合', async () => {
    const { state } = fixture();
    state.lots = [lot(505, 81, { symbol: 'HK:00700', stock_name: '同名', opened_at: '2026-11-20 09:35:00' }),
      lot(502, 81, { symbol: 'US:ABC', stock_name: '同名', opened_at: '2026-11-20 09:32:00' }),
      lot(503, 81, { symbol: 'HK:00700', stock_name: '同名', opened_at: '2026-11-20 09:33:00' }),
      lot(501, 81, { symbol: 'US:ABC', stock_name: '同名', opened_at: '2026-11-20 09:31:00' }),
      lot(504, 81, { symbol: 'US:ABC ', stock_name: '同名', opened_at: '2026-11-20 09:34:00' })];
    state.events = state.lots.map(l => opening(l));
    expect((await getForcedLiquidationSettings(input)).categories[0]!.stocks.map(s => [s.lotId, s.positionNumber]))
      .toEqual([[501, '01'], [502, '02'], [503, '03'], [505, '04'], [504, '05']]);
  });

  it('完整所有stocks先编号；搜索和enabled过滤只能保留已有号码，disabled/future版本不占位重编', async () => {
    const { state, conn } = fixture();
    state.lots = [lot(603, 81, { symbol: 'A', stock_name: '甲' }), lot(602, 81, { symbol: 'B', stock_name: '乙' }),
      lot(601, 81, { symbol: 'A', stock_name: '甲' }), lot(604, 81, { symbol: 'B', stock_name: '乙' })];
    state.events = state.lots.map(l => opening(l));
    state.stockRules = [stored({ lot_id: 601, enabled: 0 }), stored({ lot_id: 603, enabled: 1 }),
      stored({ lot_id: 602, enabled: 1 }), stored({ lot_id: 602, version: 2, enabled: 0 }),
      future(), stored({ lot_id: 604, enabled: 1, start_date: '2099-12-01' })];
    const stocks = (await getForcedLiquidationSettings(input)).categories[0]!.stocks;
    const before = structuredClone(stocks);
    expect(stocks.map(s => [s.lotId, s.positionNumber])).toEqual([[601, '01'], [603, '02'], [602, '03'], [604, '04']]);
    expect(stocks.filter(s => s.currentDownsideRule?.enabled).map(s => [s.lotId, s.positionNumber]))
      .toEqual([[603, '02'], [604, '04']]);
    expect(stocks.filter(s => s.stockName === '乙').map(s => s.positionNumber)).toEqual(['03', '04']);
    expect(stocks.filter(s => s.stockName === '乙' && s.currentDownsideRule?.enabled).map(s => s.positionNumber)).toEqual(['04']);
    expect(stocks).toEqual(before); expect(conn.execute).toHaveBeenCalledTimes(8);
  });

  it('void/已闭仓/股票epsilon空仓都不占编号，也不能抢占symbol首次出现顺序', async () => {
    const { state } = fixture();
    state.lots = [lot(100, 81, { symbol: 'A', opened_at: '2026-11-19 09:00:00' }),
      lot(101, 81, { symbol: 'B', opened_at: '2026-11-19 10:00:00' }),
      lot(102, 81, { symbol: 'C', initial_quantity: '0.00000001', opened_at: '2026-11-19 11:00:00' }),
      lot(800, 81, { symbol: 'B', opened_at: '2026-11-20 09:00:00' }),
      lot(700, 81, { symbol: 'A', opened_at: '2026-11-20 10:00:00' }),
      lot(900, 81, { symbol: 'B', opened_at: '2026-11-20 11:00:00' })];
    state.events = state.lots.map(l => opening(l, l.id === 100 ? { status: 'voided' } : {}));
    state.events.push({ id: 99, ledger_id: 37, category_id: 81, status: 'active', event_type: 'sell' });
    state.allocations = [{ lot_id: 101, event_id: 99, quantity: 100 }];
    const stocks = (await getForcedLiquidationSettings(input)).categories[0]!.stocks;
    expect(stocks.map(s => [s.lotId, s.positionNumber])).toEqual([[800, '01'], [900, '02'], [700, '03']]);
    expect(stocks.map(s => [s.lotId, s.positionNumber])).toEqual(originalPageNumbers(state.lots.filter(l => l.id >= 700)));
  });

  it('多category独立从01开始；进行中/全局暂停/全局结束均按本cat完整活跃stocks编号', async () => {
    const { state, conn } = fixture(); state.categories.push(category(84));
    state.tagConfigs = [tagConfig(82, { pause_date: '2026-11-20' }), tagConfig(84, { end_date: '2026-11-21' })];
    state.lots = [lot(801, 81, { symbol: 'A' }), lot(802, 81, { symbol: 'B' }), lot(803, 81, { symbol: 'A' }),
      lot(901, 82, { symbol: 'B' }), lot(902, 82, { symbol: 'A' }), lot(903, 82, { symbol: 'B' }),
      lot(1001, 84, { symbol: 'A' })];
    state.events = state.lots.map(l => opening(l));
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories.map(c => [c.categoryId, c.lifecycleStatus, c.stocks.map(s => [s.lotId, s.positionNumber])]))
      .toEqual([[81, 'active', [[801, '01'], [803, '02'], [802, '03']]],
        [82, 'paused', [[901, '01'], [903, '02'], [902, '03']]], [83, 'active', []], [84, 'ended', [[1001, '01']]]]);
    expect(conn.execute).toHaveBeenCalledTimes(6);
  });

  it('超过99仍是原padStart而非两位截断；批量持仓不加SELECT', async () => {
    const { state, conn } = fixture();
    state.lots = Array.from({ length: 105 }, (_, index) => lot(2000 + index));
    state.events = state.lots.map(l => opening(l));
    const stocks = (await getForcedLiquidationSettings(input)).categories[0]!.stocks;
    expect(stocks.map(s => [s.lotId, s.positionNumber])).toEqual(originalPageNumbers(state.lots));
    expect(stocks[0]?.positionNumber).toBe('01'); expect(stocks[99]?.positionNumber).toBe('100');
    expect(stocks[104]?.positionNumber).toBe('105'); expect(conn.execute).toHaveBeenCalledTimes(6);
  });

  it.each([undefined, null, '', 'invalid', '2026-2-01 09:00:00', '2026-02-30 09:00:00', '0000-00-00 00:00:00',
    '2026-11-20T09:35:16Z', new Date('2026-11-20T09:35:16Z')])
  ('缺失或非稳定opened_at=%o不伪造：该cat全活跃编号省略，其他cat正常且持仓保持真实', async openedAt => {
    const { state, conn } = fixture();
    state.lots = [lot(301), lot(302, 81, { opened_at: openedAt }), lot(401, 82)];
    state.events = state.lots.map(l => opening(l));
    const result = await getForcedLiquidationSettings(input);
    expect(result.categories[0]!.stocks).toHaveLength(2);
    for (const stock of result.categories[0]!.stocks) {
      expect(stock).not.toHaveProperty('positionNumber');
      expect(stock).toMatchObject({ quantity: 100, remainingQuantity: 100, executionPrice: 10.5,
        actualTradedAt: '2026-11-20T09:35:16+08:00', note: '原始开仓备注' });
    }
    expect(result.categories[1]!.stocks[0]).toMatchObject({ lotId: 401, positionNumber: '01' });
    expect(conn.execute).toHaveBeenCalledTimes(6);
  });

  it('旧raw fixture缺opened_at保守省略而非采用actual_traded_at/server_registered_at或DB lotId', async () => {
    const { state } = fixture();
    const { opened_at: _openedAt, ...withoutOpenedAt } = lot();
    state.rawStockRows = [{ ...withoutOpenedAt, opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 25,
      actual_traded_at: '2026-11-20 09:35:16', server_registered_at: '2026-11-21 14:00:00', note: '真实旧批次' }];
    const stock = (await getForcedLiquidationSettings(input)).categories[0]!.stocks[0]!;
    expect(stock).toMatchObject({ lotId: 101, quantity: 100, remainingQuantity: 75, note: '真实旧批次' });
    expect(stock).not.toHaveProperty('positionNumber');
    expect(JSON.parse(JSON.stringify(stock))).not.toHaveProperty('positionNumber'); // Optional on the wire, never null.
  });

  it('未知opened_at只在void/closed行时不阻断活跃编号；unknown actual仍不由opened_at填充', async () => {
    const { state } = fixture();
    state.rawStockRows = [
      { ...lot(101, 81, { opened_at: null }), opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 100 },
      { ...lot(102, 81, { opened_at: null }), opening_status: 'voided', opening_event_type: 'buy', allocated_quantity: 0 },
      { ...lot(301), opening_status: 'active', opening_event_type: 'buy', allocated_quantity: 0, actual_traded_at: null },
    ];
    expect((await getForcedLiquidationSettings(input)).categories[0]!.stocks).toMatchObject([
      { lotId: 301, positionNumber: '01', actualTradedAt: '', quantity: 100, remainingQuantity: 100 },
    ]);
  });
});
