import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { transformSync } from 'esbuild';

const deps = vi.hoisted(() => ({ db: vi.fn(), tx: vi.fn(), crypto: vi.fn(), cryptoCache: vi.fn(), calendar: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, getDbTransactionConnection: deps.tx }));
vi.mock('./price-scanner', () => ({ getUsdtCnyRate: () => 7, fetchIntradayStockQuotes: vi.fn(), refreshUsdtCnyRate: vi.fn(), resolveUsStockExchange: vi.fn(async () => 'NASDAQ'), searchManualStocks: vi.fn() }));
vi.mock('./crypto-portfolio-quotes', () => ({ fetchCryptoPortfolioQuotes: deps.crypto, getCachedCryptoPortfolioQuote: deps.cryptoCache, searchCryptoPortfolio: vi.fn() }));
vi.mock('./crypto-portfolio-fx', () => ({ getLiveCryptoUsdtCnyQuote: vi.fn(async () => ({ pair: 'USDT/CNY', rate: 7.2, stale: false })) }));
vi.mock('./usdt-cny-rate', () => ({ getLiveUsdtCnyQuote: vi.fn(async () => ({ pair: 'USDT/CNY', rate: 7.2, stale: false })) }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: vi.fn(async () => ({ pair: 'USD/CNY', rate: 7, stale: false })), fetchStockUsdCnyAtClose: vi.fn() }));
vi.mock('./stock-calendar-result-cache', () => ({ ensureStockCalendarResultTable: vi.fn(), markStockCalendarResultDirty: vi.fn(), readStockCalendarResult: deps.calendar, rebuildCachedStockCalendarResult: vi.fn() }));
import { getR1StockPresentationContext, setR1StockAiDisplay, getMyR1AiParticipationPortfolio, getStockTagPortfolio,
  getStockTagPublicPortfolio, getMyStockTagParticipantPortfolio, getStockTagDailySnapshots,
  getStockTagCalendar, getMyStockTagObservationPortfolio, getStockLotParticipationMatrix, getMyStockTagOverview } from './ledger-stock-portfolio';
import { setLedger37AiDisplay } from './ledger37-ai-presentation';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';
import { readR1AiEnabled, readR1Balances, r1PnlSummary, projectR1AiPortfolio, readR1RecordedMargins } from './r1-stock-presentation';
import { updateLedger37InitialBalances } from './ledger37-initial-balances';
import { r1AiDisplayKey, R1_AI_DISPLAY_KEY_PREFIX } from '../shared/r1-stock-presentation';

const key = LEDGER37_AI_DISPLAY_KEY;
const input = { ledgerId: 37 as const, categoryId: 90250, userId: 201 };
const admin = { ...input, userId: 100, targetUserId: 201, enabled: true };
class RowLock {
  owner: object | null = null; waiters: Array<() => void> = [];
  async acquire(owner: object) { while (this.owner && this.owner !== owner) await new Promise<void>(resolve => this.waiters.push(resolve)); this.owner = owner; }
  release(owner: object) { if (this.owner !== owner) return; this.owner = null; this.waiters.splice(0).forEach(resolve => resolve()); }
}
function participation(overrides: Record<string, unknown> = {}) {
  return { id: 1, lot_id: 101, allocated_quantity: '100', remaining_quantity: '60', entry_price: '10', start_date: '2026-11-01', pause_date: null,
    assigned_at: '2026-11-01', symbol: '600000.SH', stock_name: '测试股', opened_at: '2026-11-01', initial_quantity: '100', unit_cost: '20',
    opening_actual_traded_at: '2026-11-02 10:00:00', closed_quantity: '40', closed_value: '360', realized_pnl: '40', ...overrides };
}
function observation(overrides: Record<string, unknown> = {}) {
  return { lot_id: 101, user_id: 201, enabled: 1, quantity: '1000', entry_price: '10', start_date: '2026-11-01', pause_date: null,
    assigned_by: 100, created_at: '2026-11-01', updated_at: '2026-11-01', symbol: '600000.SH', stock_name: '测试股',
    initial_quantity: '100', sold_quantity: '40', sold_value: '360', sold_at: '2026-11-03', sold_date: '2026-11-03', ...overrides };
}
function fixture(raw: string | null = JSON.stringify({ [key]: 1 })) {
  const state = { raw, updatedAt: '2025-01-01 00:00:00', categoryId: 90250, name: 'R1', mode: 'stock_portfolio', parentId: null as number | null,
    ownerId: 100, role: 'member', actorRole: 'admin', memberExists: true, ledgerExists: true, fail: '', affected: 1,
    price: 8 as number | null, participations: [participation()], observations: [] as any[], holds: [] as any[],
    allowLegacy: false, afterMember: null as null | (() => Promise<void>) };
  const log: Array<{ sql: string; values: any[] }> = [];
  const ledgerLock = new RowLock(), memberLock = new RowLock();
  function connection() {
    let snapshot: string | null = null, changed = false;
    const conn = { beginTransaction: vi.fn(async () => { snapshot = state.raw; }),
      commit: vi.fn(async () => { if (state.fail === 'commit') throw new Error('commit failed'); ledgerLock.release(conn); memberLock.release(conn); }),
      rollback: vi.fn(async () => { if (changed) state.raw = snapshot; ledgerLock.release(conn); memberLock.release(conn); }),
      release: vi.fn(() => { ledgerLock.release(conn); memberLock.release(conn); }),
      execute: vi.fn(async (sql: string, values: any[] = []) => {
        log.push({ sql, values });
        if (state.fail === 'sql') throw new Error('SQL failed');
        if (/FROM ledgers l/.test(sql)) return [state.ledgerExists ? [{ ledger_id: 37, ledger_owner_id: state.ownerId, member_user_id: state.memberExists ? values[0] : null, member_role: values[0] === 100 ? state.actorRole : state.role, initialBalances: values[0] === 100 ? '{}' : state.raw }] : []];
        if (/SELECT id, ownerId AS ledger_owner_id FROM ledgers/.test(sql)) { await ledgerLock.acquire(conn); return [state.ledgerExists ? [{ id: 37, ledger_owner_id: state.ownerId }] : []]; }
        if (/FROM ledger_categories/.test(sql)) {
          const category = { id: state.categoryId, ledgerId: 37, name: state.name, parentId: state.parentId, accounting_mode: state.mode };
          if (sql.includes('FOR UPDATE')) { expect(ledgerLock.owner).toBe(conn); return [[category]]; }
          if (sql.includes('SELECT DISTINCT')) return [[category]];
          const viewer = values[0];
          return [[{ ...category, ledger_owner_id: state.ownerId, member_user_id: state.memberExists ? viewer : null, member_role: viewer === 100 ? state.actorRole : state.role,
            initialBalances: viewer === 100 ? '{}' : state.raw }]];
        }
        if (/FROM ledger_members/.test(sql)) {
          expect(sql).toContain('FOR UPDATE'); expect(ledgerLock.owner).toBe(conn); await memberLock.acquire(conn);
          snapshot = state.raw; await state.afterMember?.();
          return [[{ id: 10, userId: 100, role: state.actorRole, initial_balances: '{}' },
            ...(state.memberExists ? [{ id: 20, userId: 201, role: state.role, initial_balances: state.raw }] : [])]];
        }
        if (/UPDATE ledger_members/.test(sql)) {
          expect(memberLock.owner).toBe(conn); expect(sql).toContain('updatedAt = updatedAt');
          expect(values.slice(-4)).toEqual([20, 37, 201, state.raw]); expect(typeof values[0]).toBe('string');
          if (state.fail === 'update') throw new Error('update failed');
          if (state.affected !== 1) return [{ affectedRows: state.affected }];
          // 新写入直接传入无损替换后的JSON文本。
          const base = state.raw || '{}'; JSON.parse(base);
          state.raw = values[0];
          changed = true; return [{ affectedRows: 1 }];
        }
        if (/information_schema.columns/.test(sql) && state.allowLegacy) return [[{ COLUMN_NAME: 'accounting_mode' }, { COLUMN_NAME: 'transaction_fee' }, { COLUMN_NAME: 'note' }, { COLUMN_NAME: 'usd_cny_rate' }, { COLUMN_NAME: 'start_date' }, { COLUMN_NAME: 'pause_date' }]];
        if (/^\s*CREATE TABLE/.test(sql) && state.allowLegacy) return [{ affectedRows: 0 }];
        if (/information_schema.tables/.test(sql)) return [sql.includes("table_name = 'ledger_stock_lot_observations'") ? [{ TABLE_NAME: 'ledger_stock_lot_observations' }] : []];
        if (/FROM ledger_stock_lot_participations p/.test(sql)) return [state.participations];
        if (/FROM ledger_stock_lot_observations o/.test(sql)) return [state.observations];
        if (/FROM ai_wallet_project_holds/.test(sql)) { expect(values.slice(0, 3)).toEqual([37, 201, state.name]); return [state.holds]; }
        if (/FROM ledger_stock_participation_closures/.test(sql)) return [[]];
        if (/FROM ledger_crypto_portfolio/.test(sql)) return [[]];
        if (/MIN\(e.settlement_effective_date\)/.test(sql)) return [[]];
        if (/FROM ledger_stock_events e/.test(sql) && sql.includes('market_reference_price')) return [[]];
        if (/FROM ledger_stock_price_snapshots/.test(sql)) return [[]];
        if (/FROM ledger_stock_intraday_quotes/.test(sql)) return [state.price === null ? [] : [{ symbol: '600000.SH', price: state.price, price_date: '2026-11-05', captured_at: '2026-11-05T01:00:00Z' }]];
        if (/SELECT 1 AS eligible/.test(sql)) return [[{ eligible: 1 }]];
        throw new Error(`非白名单SQL（禁止任何资金/服务/实际DB）: ${sql}`);
      }) };
    return conn;
  }
  const read = connection(); deps.db.mockResolvedValue(read); deps.tx.mockImplementation(async () => connection());
  return { state, log, read, connection, writes: () => log.filter(row => /^\s*UPDATE/.test(row.sql)) };
}
function assertSafe(value: any) {
  const denied = /^(entryPrice|unitCost|averageCost|avgCost|marketPrice|marketValue|costValue|closedValue|buyValue|sellValue|tagName|counterparty|assignedBy|createdBy|notes?|history|members|matrix|closedLots|positions|latestSnapshot|priorSnapshot)$/i;
  if (!value || typeof value !== 'object') return;
  for (const [field, child] of Object.entries(value)) { expect(field).not.toMatch(denied); assertSafe(child); }
}
let testClock = Date.parse('2026-11-05T02:00:00Z');
beforeEach(() => { testClock += 60000; vi.clearAllMocks(); vi.stubEnv('DEV_BYPASS_AUTH', 'false'); vi.stubEnv('PREVIEW_READONLY', 'false');
  vi.spyOn(Date, 'now').mockReturnValue(testClock); deps.crypto.mockResolvedValue({}); deps.cryptoCache.mockReturnValue(null); deps.calendar.mockResolvedValue([]); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('R1旧DTO复用全局开关、failclosed与无损CAS', () => {
  it('旧setR1入口退役且不连接DB', async () => { const f = fixture(); await expect(setR1StockAiDisplay(admin)).rejects.toThrow('使用账本全局AI设置'); expect(f.log).toHaveLength(0); });
  it('稳定category key，标签改名不影响已开启状态', async () => { const f = fixture(); f.state.name = '已改名'; expect(key).toBe('__ledger37AiDisplay'); expect(await getR1StockPresentationContext(input)).toEqual({ ledgerId: 37, categoryId: 90250, viewerUserId: 201, canManage: false, aiEnabled: true }); expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true); });
  it.each([null, '', '{}', `{"${key}":0}`])('未配置/数字0默认false %s', async raw => { fixture(raw); expect((await getR1StockPresentationContext(input)).aiEnabled).toBe(false); });
  it.each([`{"${key}":"1"}`, `{"${key}":true}`, `{"${key}":null}`, `{"${key}":2}`])('非法AI开关值%s读写均拒绝', async raw => { fixture(raw); await expect(getR1StockPresentationContext(input)).rejects.toThrow('必须是数字0或1'); await expect(setLedger37AiDisplay(admin)).rejects.toThrow('必须是数字0或1'); });
  it.each(['broken', 'null', '[]', '123', '"x"', ' '])('坏JSON %s读写均拒绝，无raw fallback', async raw => { const f = fixture(raw); await expect(getR1StockPresentationContext(input)).rejects.toThrow(); await expect(getStockTagPortfolio(input)).rejects.toThrow(); await expect(setLedger37AiDisplay(admin)).rejects.toThrow(); expect(f.writes()).toHaveLength(0); });
  it('SQL失败不得降为missingfalse，已缓存safe也必须重新授权', async () => { const f = fixture(); await getMyR1AiParticipationPortfolio(input); f.state.fail = 'sql'; await expect(getR1StockPresentationContext(input)).rejects.toThrow('SQL failed'); await expect(getMyR1AiParticipationPortfolio(input)).rejects.toThrow('SQL failed'); });
  it.each(['member', 'admin', 'owner'])('真实owner的成员role=%s可写', async role => { const f = fixture('{}'); f.state.actorRole = role; await expect(setLedger37AiDisplay(admin)).resolves.toEqual({ success: true, aiEnabled: true }); expect(JSON.parse(f.state.raw!)[key]).toBe(1); });
  it('非owner成员与系统管理员不能写，任何代看禁止写/继承真实管理权限', async () => { const f = fixture('{}'); f.state.ownerId = 999; f.state.actorRole = 'member'; await expect(setLedger37AiDisplay(admin)).rejects.toThrow('所有者'); await expect(setLedger37AiDisplay({ ...admin, systemRole: 'super_admin' })).rejects.toThrow('所有者'); await expect(setLedger37AiDisplay({ ...admin, systemRole: 'super_admin', isViewingAs: true })).rejects.toThrow('代看'); expect((await getR1StockPresentationContext({ ...input, systemRole: 'admin', isViewingAs: true })).canManage).toBe(false); });
  it.each(['target', 'child', 'mode', 'ledger'])('%s错误拒绝且不写', async kind => { const f = fixture('{}'); if (kind === 'target') f.state.memberExists = false; if (kind === 'child') f.state.parentId = 1; if (kind === 'mode') f.state.mode = 'manual_balance'; if (kind === 'ledger') f.state.ledgerExists = false; await expect(kind === 'child' || kind === 'mode' ? getR1StockPresentationContext(input) : setLedger37AiDisplay(admin)).rejects.toThrow(); expect(f.writes()).toHaveLength(0); });
  it('所有旧tag开关忽略，其他账本setter拒绝', async () => { fixture(`{"${R1_AI_DISPLAY_KEY_PREFIX}90251":1}`); expect((await getR1StockPresentationContext(input)).aiEnabled).toBe(false); await expect(setLedger37AiDisplay({ ...admin, ledgerId: 52 as any })).rejects.toThrow('仅适用于'); });
  it('锁顺序ledger→members，单key且updatedAt不漂移，大数字和18位兄弟键保留，同scope重复幂等', async () => {
    const raw = '{"huge":900719925474099312345,"crypto":"2.123456789123456789","R1__startDate":"2020-01-01","__stockAiDisplay_category_90251":1}';
    const f = fixture(raw); await setLedger37AiDisplay(admin); await setLedger37AiDisplay(admin);
    expect(f.log.slice(0, 2).map(row => row.sql.match(/FROM (\w+)/)![1])).toEqual(['ledgers', 'ledger_members']);
    expect(f.log.slice(0, 2).every(row => row.sql.includes('FOR UPDATE'))).toBe(true); expect(f.writes()).toHaveLength(1);
    expect(f.state.raw).toContain('900719925474099312345'); expect(f.state.raw).toContain('2.123456789123456789'); expect(f.state.updatedAt).toBe('2025-01-01 00:00:00');
    await setLedger37AiDisplay({ ...admin, enabled: false }); expect(JSON.parse(f.state.raw!)[key]).toBe(0); expect(JSON.parse(f.state.raw!).__stockAiDisplay_category_90251).toBe(1);
  });
  it.each(['update', 'commit'])('%s失败回滚原JSON', async fail => { const f = fixture('{"precision":"0.123456789123456789"}'); f.state.fail = fail; const original = f.state.raw; await expect(setLedger37AiDisplay(admin)).rejects.toThrow(); expect(f.state.raw).toBe(original); });
  it('并发同scope事务在账本锁串行且第二次幂等', async () => { const f = fixture('{}'); let entered!: () => void, resume!: () => void; const gate = new Promise<void>(r => { resume = r; }); const locked = new Promise<void>(r => { entered = r; }); f.state.afterMember = async () => { f.state.afterMember = null; entered(); await gate; }; const first = setLedger37AiDisplay(admin); await locked; const second = setLedger37AiDisplay(admin); await Promise.resolve(); resume(); await Promise.all([first, second]); expect(f.writes()).toHaveLength(1); });
  it.each([key, `${R1_AI_DISPLAY_KEY_PREFIX}90251`, `${R1_AI_DISPLAY_KEY_PREFIX}invalid`, R1_AI_DISPLAY_KEY_PREFIX])('通用patch始终拒绝保留键%s，即使相同', async field => { const f = fixture(); await expect(updateLedger37InitialBalances(f.read, 201, { [field]: 1 })).rejects.toThrow('AI展示专用'); expect(f.log).toHaveLength(0); });
  it('旧updateMy实际委托通用服务，没有任意record直写AI旁路', async () => {
    const source = readFileSync(new URL('./db-ledger.ts', import.meta.url), 'utf8'); const ast = ts.createSourceFile('db-ledger.ts', source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'updateMyInitialBalances')!;
    const code = transformSync(fn.getText(ast).replace(/^export /, '').replace("await import('./db')", 'await dbModule()').replace("await import('./ledger37-initial-balances')", 'await serviceModule()') + '\nreturn updateMyInitialBalances;', { loader: 'ts', target: 'es2022' }).code;
    const f = fixture(); const run = new Function('dbModule', 'serviceModule', code)(async () => ({ getDbTransactionConnection: async () => f.read }), async () => ({ updateLedger37InitialBalances }));
    await expect(run(37, 201, { [key]: 1 })).rejects.toThrow('AI展示专用'); expect(f.read.release).toHaveBeenCalledOnce(); expect(f.log).toHaveLength(0);
  });
});

describe('安全已算收益及观察不结算', () => {
  it.each([[120, 40, 160], [-120, 40, -80], [0, 0, 0], [null, 40, null], [120, null, null]])('摘要原浮盈%s+已实现%s=%s', (floating, realized, total) => { expect(r1PnlSummary(floating, realized).totalPnl).toBe(total); });
  it('safe读取首次cachemiss仅SELECT，部分平仓120+40=160，无closedLots重复，row原币', async () => { const f = fixture(); const result = await getMyR1AiParticipationPortfolio(input);
    expect(result.summary).toEqual({ floatingPnl: 120, realizedPnl: 40, totalPnl: 160 }); expect(result.participations).toHaveLength(1); expect(result.participations[0]).toMatchObject({ currency: 'CNY', quantity: 60, allocatedQuantity: 100, allocationRatio: 1, floatingPnl: 120, realizedPnl: 40, totalPnl: 160 }); assertSafe(result);
    expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true); expect(deps.tx).not.toHaveBeenCalled();
  });
  it.each([[12, -120, -80], [10, 0, 40], [null, null, null]])('已算价格状态%s方向/null保留', async (price, floatingPnl, totalPnl) => { const f = fixture(); f.state.price = price; const result = await getMyR1AiParticipationPortfolio(input); expect(result.summary).toMatchObject({ floatingPnl, totalPnl }); assertSafe(result); });
  it('全平仓零float，仅已有realized一次；未来状态pending不参与汇总', async () => { const f = fixture(); f.state.participations = [participation({ remaining_quantity: 0, realized_pnl: -73 }), participation({ id: 2, start_date: '2099-01-01' })]; const result = await getMyR1AiParticipationPortfolio(input); expect(result.summary).toEqual({ floatingPnl: 0, realizedPnl: -73, totalPnl: -73 }); expect(result.participations.map(row => row.status)).toEqual(['closed', 'pending']); });
  it('纯观察无真实参与也可safe；观察1600不混入真实0，未来保持pending，仅SELECT', async () => { const f = fixture(); f.state.participations = []; f.state.observations = [observation(), observation({ lot_id: 102, start_date: '2099-01-01' })]; const result = await getMyR1AiParticipationPortfolio(input); expect(result.summary).toEqual({ floatingPnl: 0, realizedPnl: 0, totalPnl: 0 }); expect(result.observation?.summary).toEqual({ floatingPnl: 1200, realizedPnl: 400, totalPnl: 1600 }); expect(result.observation?.participations.map(row => row.status)).toEqual(['active', 'pending']); assertSafe(result); expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true); });
  it('暂停观察缺历史价保持未知、不借未来价或结算', async () => { const f = fixture(); f.state.participations = []; f.state.observations = [observation({ pause_date: '2026-11-02', sold_quantity: 0, sold_value: 0 })];
    const base = f.read.execute.getMockImplementation()!; f.read.execute.mockImplementation(async (sql, values) => /FROM ledger_stock_lots l/.test(sql) ? [[{ id: 101, category_id: 90250, symbol: '600000.SH', initial_quantity: 100, sold_quantity: 0, sold_value: 0 }]] : sql.includes('DATE_ADD') ? [[]] : base(sql, values));
    const result = await getMyR1AiParticipationPortfolio(input); expect(result.observation?.participations[0]).toMatchObject({ status: 'paused', floatingPnl: null, totalPnl: null }); expect(result.summary.totalPnl).toBe(0); expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
  });
  it('数字币原币row不套USD汇率，summary沿用现有USDT FX且最小币量保留', async () => {
    const f = fixture(); f.state.participations = [participation({ symbol: 'CRYPTO:BTY-USDT', remaining_quantity: '0.00000001', allocated_quantity: '0.00000001',
      initial_quantity: '1', realized_pnl: '0.125', closed_quantity: '0', entry_price: '10' })];
    deps.cryptoCache.mockReturnValue({ symbol: 'CRYPTO:BTY-USDT', currency: 'USDT', price: 8,
      updatedAt: new Date(testClock).toISOString(), priceDate: '2026-11-05', source: 'HTX' });
    const result = await getMyR1AiParticipationPortfolio(input);
    expect(result.usdtCnyRate).toBe(7.2); expect(result.participations[0]).toMatchObject({ currency: 'USDT', quantity: 0.00000001, realizedPnl: 0.125 });
    expect(result.participations[0].floatingPnl).toBeCloseTo(0.00000002, 15);
    expect(result.summary.realizedPnl).toBeCloseTo(0.125 * 7.2, 12); assertSafe(result);
    expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true); expect(deps.tx).not.toHaveBeenCalled();
  });
  it('管理员可预览safe，不开启普通成员仍拒绝，hidden读拒绝', async () => { const f = fixture('{}'); await expect(getMyR1AiParticipationPortfolio(input)).rejects.toThrow('尚未开启'); await expect(getMyR1AiParticipationPortfolio({ ...input, userId: 100 })).resolves.toHaveProperty('aiEnabled', false); f.state.raw = `{"${key}":1,"R1__visible":0}`; await expect(getMyR1AiParticipationPortfolio(input)).rejects.toThrow('无权'); });
  it('递归白名单剔除所有深层prices/identity/history，原始数据不修改，摘要不叠加closedLots', () => { const portfolio = { positions: [{ quoteUpdatedAt: '2026-11-01', entryPrice: 10 }], closedLots: [{ realizedPnl: 100 }], summary: { floatingPnl: 2, realizedPnl: 3, totalPnl: 105, usdCnyRate: null, usdtCnyRate: null, costValue: 999 } };
    const row: any = { id: 1, symbol: 'AAPL', stockName: '股', currency: 'USD', quantity: 2, allocatedQuantity: 3, allocationRatio: 0.1, startDate: null, status: 'active', floatingPnl: 2, realizedPnl: 3, totalPnl: 999, entryPrice: 100, notes: [{ admin: 100 }] };
    const result = projectR1AiPortfolio({ context: { ledgerId: 37, categoryId: 90250, viewerUserId: 201, canManage: false, aiEnabled: true }, portfolio, participations: [row], observation: null, recordedMargins: null }); assertSafe(result); expect(result.summary.totalPnl).toBe(5); expect(result.participations[0].totalPnl).toBe(5); expect(row.totalPnl).toBe(999);
  });
});

describe('旧raw封堵与兼容范围', () => {
  it.each([getStockTagPortfolio, getStockTagPublicPortfolio, getMyStockTagParticipantPortfolio, getStockTagDailySnapshots, getStockTagCalendar, getMyStockTagObservationPortfolio, getStockLotParticipationMatrix])('%s普通开启用户旧raw拒绝先于DDL/数据读取', async read => { const f = fixture(); await expect(read(input)).rejects.toThrow('安全参与收益接口'); expect(f.log).toHaveLength(1); expect(f.log[0].sql).toContain('LEFT JOIN ledger_members'); });
  it('系统admin非owner不能raw读，真实owner可读而代看不能升级', async () => { const f = fixture(); await expect(getStockTagCalendar({ ...input, systemRole: 'admin' })).rejects.toThrow('安全参与收益接口'); f.state.ownerId = input.userId; expect(await getStockTagCalendar(input)).toEqual([]); await expect(getStockTagCalendar({ ...input, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('安全参与收益接口'); });
  it('未开AI和其他tag保持原始calendar，旧观察形状无变化', async () => { const f = fixture('{}'); expect(await getStockTagCalendar(input)).toEqual([]); expect(await getMyStockTagObservationPortfolio(input)).toHaveProperty('observationView', true); f.state.categoryId = 90251; f.state.raw = `{"${r1AiDisplayKey(90250)}":1}`; expect(await getStockTagCalendar({ ...input, categoryId: 90251 })).toEqual([]); });
  it('overview已算首页收益不变，但不泄漏cost/latest snapshots/missing identity', async () => { const f = fixture(); f.state.allowLegacy = true; const result = await getMyStockTagOverview({ ledgerId: 37, userId: 201 }); expect(result).toHaveLength(1); expect(result[0].summary.totalPnl).toBe(null); assertSafe(result); });
  it('先读未开启overview旧形状，开启后即使缓存命中也必须安全投影且收益不变', async () => {
    const f = fixture('{}'); f.state.allowLegacy = true;
    const before = await getMyStockTagOverview({ ledgerId: 37, userId: 201 }); expect(before[0].summary).toHaveProperty('costValue');
    await setLedger37AiDisplay(admin);
    const after = await getMyStockTagOverview({ ledgerId: 37, userId: 201 }); assertSafe(after);
    expect(after[0].summary.totalPnl).toBe(before[0].summary.totalPnl);
    const systemAdmin = await getMyStockTagOverview({ ledgerId: 37, userId: 201, systemRole: 'admin' }); assertSafe(systemAdmin); f.state.ownerId = 201; const management = await getMyStockTagOverview({ ledgerId: 37, userId: 201 }); expect(management[0].summary).toHaveProperty('costValue');
    const viewed = await getMyStockTagOverview({ ledgerId: 37, userId: 201, systemRole: 'admin', isViewingAs: true }); assertSafe(viewed);
  });
});

describe('登记保证金精确原币（不调用钱包ensure或资金模型）', () => {
  it('18位crypto本金减released精确保留，仅计一个hold，release/reversal不重复；manual负转出+冲正净额', async () => {
    const f = fixture(); f.state.holds = [{ id: 9, ledger_id: 37, user_id: 201, tag_name: 'R1', asset_code: 'BTY', amount: '2.123456789123456789', released_amount: '1.000000000000000001', status: 'active' }];
    const balances = { R1__margins: JSON.stringify([{ id: 'a', coin: 'BTY', amount: '2.123456789123456789', source: 'wallet_hold', holdId: 9 }, { id: 'b', coin: 'BTY', amount: '-1', source: 'wallet_hold', holdId: 9, entryKind: 'release' }, { id: 'c', coin: 'BTY', amount: '1', source: 'wallet_hold', holdId: 9, entryKind: 'reversal' }, { coin: 'CNY', amount: '100' }, { coin: 'CNY', amount: '-40' }, { coin: 'CNY', amount: '10', entryKind: 'reversal' }]) };
    expect(await readR1RecordedMargins(f.read, balances, 'R1', 201)).toEqual([{ assetCode: 'BTY', amount: '1.123456789123456788' }, { assetCode: 'CNY', amount: '70' }]); expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
  });
  it('完全released为0，不能拿原freeze金额当当前现金', async () => { const f = fixture(); f.state.holds = [{ id: 9, ledger_id: 37, user_id: 201, tag_name: 'R1', asset_code: 'USDT', amount: '200', released_amount: '200', status: 'released' }]; expect(await readR1RecordedMargins(f.read, { R1__margins: [{ coin: 'USDT', amount: '200', source: 'wallet_hold', holdId: 9 }] }, 'R1', 201)).toEqual([{ assetCode: 'USDT', amount: '0' }]); });
  it.each([{ R1__margin: '200' }, { R1__margins: 'bad' }, { R1__margins: [{ amount: 200 }] }, { R1__margins: [{ coin: 'CNY', amount: '-100' }] }, { R1__margins: [{ coin: 'CNY', amount: '1', source: 'unknown' }] }])('不可靠保证金%j为null，不默认币种、不推算cash', async balances => { const f = fixture(); expect(await readR1RecordedMargins(f.read, balances, 'R1', 201)).toBeNull(); });
  it('只有cost/20%需求没有登记可靠coin+金额返回空；旧coin+单额可靠读取', async () => { const f = fixture(); expect(await readR1RecordedMargins(f.read, { costValue: 1000, R1__targetAmount: 200 }, 'R1', 201)).toEqual([]); expect(await readR1RecordedMargins(f.read, { R1__margin: '0.000000000000000001', R1__marginCoin: 'BTC' }, 'R1', 201)).toEqual([{ assetCode: 'BTC', amount: '0.000000000000000001' }]); });
  it('hold不属于当前R1成员/SQL失败必须unknown或抛错，不能默认false/现金0', async () => { const f = fixture(); const balances = { R1__margins: [{ coin: 'CNY', amount: 1, source: 'wallet_hold', holdId: 9 }] }; expect(await readR1RecordedMargins(f.read, balances, 'R1', 201)).toBeNull(); f.state.fail = 'sql'; await expect(readR1RecordedMargins(f.read, balances, 'R1', 201)).rejects.toThrow('SQL failed'); });
  it('精确启用函数只接受数字0/1，非法值抛错', () => { expect(readR1AiEnabled(readR1Balances(`{"${key}":1}`))).toBe(true); expect(readR1AiEnabled(readR1Balances(`{"${key}":0}`))).toBe(false); expect(() => readR1AiEnabled({ [key]: '1' })).toThrow(); });
});
