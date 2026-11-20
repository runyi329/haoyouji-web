import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const deps = vi.hoisted(() => ({ db: vi.fn(), tx: vi.fn(), crypto: vi.fn(), calendar: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, getDbTransactionConnection: deps.tx }));
vi.mock('./price-scanner', () => ({ getUsdtCnyRate: () => 7, fetchIntradayStockQuotes: vi.fn(), refreshUsdtCnyRate: vi.fn(), resolveUsStockExchange: vi.fn(async () => 'NASDAQ'), searchManualStocks: vi.fn() }));
vi.mock('./crypto-portfolio-quotes', () => ({ fetchCryptoPortfolioQuotes: deps.crypto, getCachedCryptoPortfolioQuote: vi.fn(() => null), searchCryptoPortfolio: vi.fn() }));
vi.mock('./crypto-portfolio-fx', () => ({ getLiveCryptoUsdtCnyQuote: vi.fn(async () => null) }));
vi.mock('./stock-calendar-result-cache', () => ({ ensureStockCalendarResultTable: vi.fn(() => { throw new Error('禁止DDL'); }), markStockCalendarResultDirty: vi.fn(), readStockCalendarResult: deps.calendar, rebuildCachedStockCalendarResult: vi.fn() }));
import { LEDGER37_AI_DISPLAY_KEY as key } from '../shared/ledger37-ai-presentation';
import { getLedger37PresentationContext, setLedger37AiDisplay, getMyLedger37AiOverview, readLedger37Balances, readLedger37AiEnabled } from './ledger37-ai-presentation';
import { setR1StockAiDisplay, getR1StockPresentationContext, getStockTagPortfolio, getStockTagPublicPortfolio, getMyStockTagParticipantPortfolio, getStockTagDailySnapshots, getStockTagCalendar, getMyStockTagObservationPortfolio, getStockLotParticipationMatrix, getMyR1AiParticipationPortfolio, getMyLedger37SafeStockDirectory, getMyStockTagOverview, getMyStockTagObservationOverview } from './ledger-stock-portfolio';
import { updateLedger37InitialBalances } from './ledger37-initial-balances';
const self = { ledgerId: 37 as const, userId: 201 };
const setter = { ...self, userId: 100, targetUserId: 201, enabled: true };
const legacy = '__stockAiDisplay_category_90250';
const categories = [
  { id: 90250, ledgerId: 37, name: '绝密R1', parentId: null, accounting_mode: 'stock_portfolio', isDefault: 0 },
  { id: 90251, ledgerId: 37, name: '绝密第二股票', parentId: null, accounting_mode: 'stock_portfolio', isDefault: 0 },
  { id: 90300, ledgerId: 37, name: '绝密普通甲', parentId: null, accounting_mode: 'manual_balance', isDefault: 0 },
  { id: 90301, ledgerId: 37, name: '绝密普通乙', parentId: null, accounting_mode: 'manual_balance', isDefault: 0 },
];
function fixture(raw = JSON.stringify({ [key]: 1, '绝密普通甲__margin': '123.123456789123456789', '绝密普通甲__marginCoin': 'CNY', '绝密普通甲__startDate': '2024-01-02' })) {
  const state = { raw: raw as string | null, actorRole: 'admin', viewerRole: 'member', targetExists: true, ledgerExists: true, affectedRows: 1, failCommit: false, failRead: false, noParticipations: false, observer: false };
  const log: Array<{ sql: string; values: any[] }> = [];
  let snapshot: string | null = null;
  const conn = {
    beginTransaction: vi.fn(async () => { snapshot = state.raw; }),
    commit: vi.fn(async () => { if (state.failCommit) throw new Error('commit failed'); }),
    rollback: vi.fn(async () => { state.raw = snapshot; }), release: vi.fn(),
    execute: vi.fn(async (sql: string, values: any[] = []) => {
      log.push({ sql, values });
      if (state.failRead && /^\s*SELECT/.test(sql)) throw new Error('read failed');
      if (/FROM ledgers l/.test(sql)) return [state.ledgerExists ? [{ ledger_id: 37, member_user_id: state.targetExists ? values[0] : null, member_role: values[0] === 100 ? state.actorRole : state.viewerRole, initialBalances: values[0] === 100 ? '{}' : state.raw }] : []];
      if (/SELECT id FROM ledgers/.test(sql)) return [state.ledgerExists ? [{ id: 37 }] : []];
      if (/FROM ledger_members/.test(sql)) return [[{ id: 10, userId: 100, role: state.actorRole, initial_balances: '{}' }, ...(state.targetExists ? [{ id: 20, userId: 201, role: state.viewerRole, initial_balances: state.raw }] : [])]];
      if (/UPDATE ledger_members/.test(sql)) {
        expect(sql).toContain('updatedAt = updatedAt'); expect(sql).toContain('BINARY initial_balances <=> BINARY ?');
        expect(values.slice(1)).toEqual([20, 37, 201, state.raw]);
        if (state.affectedRows === 1) state.raw = values[0];
        return [{ affectedRows: state.affectedRows }];
      }
      if (!/^\s*SELECT/.test(sql)) throw new Error('离线测试禁止非白名单SQL：' + sql);
      if (/FROM ledger_categories c/.test(sql)) {
        if (/LEFT JOIN ledger_members/.test(sql)) {
          const category = categories.find(c => c.id === values[1]);
          return [category ? [{ ...category, member_user_id: state.targetExists ? values[0] : null, member_role: values[0] === 100 ? state.actorRole : state.viewerRole, initialBalances: values[0] === 100 ? '{}' : state.raw }] : []];
        }
        return [categories.filter(c => /manual_balance/.test(sql) ? c.accounting_mode === 'manual_balance' : c.accounting_mode === 'stock_portfolio')];
      }
      if (/FROM dividend_records/.test(sql)) { expect(values).toEqual([37, 201]); expect(sql).toContain('user_id=?'); return [[{ tag_name: '绝密普通甲', total: '23.45' }, { tag_name: '绝密普通乙', total: '-2.50' }]]; }
      if (/information_schema.tables/.test(sql)) return [sql.includes("table_name = 'ledger_stock_lot_observations'") && state.observer ? [{ TABLE_NAME: 'ledger_stock_lot_observations' }] : []];
      if (/FROM ledger_stock_lot_observations o/.test(sql)) {
        if (!state.observer) return [[]];
        if (/COUNT\(DISTINCT/.test(sql)) return [[{ id: 90251, name: '绝密第二股票', holding_count: 1 }]];
        return [[{ lot_id: 101, user_id: 201, enabled: 1, quantity: '10', entry_price: '10', start_date: '2024-01-02', pause_date: null, assigned_by: 100, created_at: '2024-01-02', updated_at: '2024-01-02', symbol: '600000.SH', stock_name: '测试股', initial_quantity: '100', sold_quantity: '0', sold_value: '0' }]];
      }
      if (/FROM ledger_stock_lot_participations p/.test(sql)) {
        if (sql.includes('eligible')) return [state.noParticipations ? [] : [{ eligible: 1 }]];
        expect(values).toEqual([values[0], 201]);
        return [state.noParticipations ? [] : [{ id: values[0], lot_id: values[0], allocated_quantity: '100', remaining_quantity: '60', entry_price: '10', start_date: '2024-01-02', pause_date: null, assigned_at: '2024-01-02', symbol: '600000.SH', stock_name: '测试股', opened_at: '2024-01-02', initial_quantity: '100', unit_cost: '20', opening_actual_traded_at: '2024-01-02 10:00:00', closed_quantity: '40', closed_value: '360', realized_pnl: '40' }]];
      }
      if (/FROM ledger_stock_intraday_quotes/.test(sql)) return [[{ symbol: '600000.SH', price: 8, price_date: '2024-01-03', captured_at: '2024-01-03T02:00:00Z' }]];
      if (/FROM ledger_stock_events e|FROM ledger_stock_price_snapshots|FROM ledger_stock_participation_closures|FROM ledger_crypto_portfolio/.test(sql)) return [[]];
      throw new Error('离线测试未知SQL：' + sql);
    }),
  };
  deps.db.mockResolvedValue(conn); deps.tx.mockResolvedValue(conn);
  return { state, log, conn, writes: () => log.filter(entry => /^\s*UPDATE/.test(entry.sql)) };
}
function safe(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/绝密|entryPrice|unitCost|marketPrice|costValue|marketValue|initialBalances|initial_balances|tagName|categoryName|counterparty|assignedBy|history|notes|positions|members|walletSnapshot/);
}
let clock = Date.parse('2026-11-05T02:00:00Z');
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('DEV_BYPASS_AUTH', 'false'); vi.stubEnv('PREVIEW_READONLY', 'false'); clock += 60000; vi.spyOn(Date, 'now').mockReturnValue(clock); deps.crypto.mockImplementation(() => { throw new Error('禁止网络'); }); deps.calendar.mockResolvedValue([]); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('ledger37唯一全局AI设置', () => {
  it('旧fixture缺少资料字段返回viewer:null，原配置和权限来源不变', async () => {
    const f = fixture();
    expect(await getLedger37PresentationContext(self)).toEqual({ ledgerId: 37, viewerUserId: 201, canManage: false, aiEnabled: true, viewer: null, isViewingAs: false });
    expect(f.log).toHaveLength(1); expect(f.writes()).toHaveLength(0);
  });
  it.each([null, '', '{}', `{"${legacy}":1}`, `{"${key}":0,"${legacy}":1}`])('缺失/0覆盖遗留tagtrue %s', async raw => { fixture(raw as any); expect((await getLedger37PresentationContext(self)).aiEnabled).toBe(false); expect((await getR1StockPresentationContext({ ...self, categoryId: 90250 })).aiEnabled).toBe(false); });
  it.each([true, false, null, '1', '0', 2, [], {}])('strict非法全局值%j读写均拒绝', async value => { const f = fixture(JSON.stringify({ [key]: value })); await expect(getLedger37PresentationContext(self)).rejects.toThrow('数字0或1'); await expect(setLedger37AiDisplay(setter)).rejects.toThrow('数字0或1'); expect(f.writes()).toHaveLength(0); });
  it.each([`{"${key}":1,"${key}":0}`, `{"${key}":1,"__ledger37AiDispl\\u0061y":0}`])('重复全局键failclosed %s', async raw => { const f = fixture(raw); await expect(getLedger37PresentationContext(self)).rejects.toThrow('重复'); await expect(setLedger37AiDisplay(setter)).rejects.toThrow('重复'); expect(f.writes()).toHaveLength(0); });
  it.each(['broken', 'null', '[]', '42', ' ', '"x"'])('损坏JSON读写拒绝%s', async raw => { const f = fixture(raw); await expect(getLedger37PresentationContext(self)).rejects.toThrow(); await expect(setLedger37AiDisplay(setter)).rejects.toThrow(); expect(f.writes()).toHaveLength(0); });
  it('只接受own数字0/1，不继承原型且legacy任意值不作权限来源', () => { expect(readLedger37AiEnabled(Object.create({ [key]: 1 }))).toBe(false); expect(readLedger37AiEnabled(readLedger37Balances(`{"${legacy}":true,"${legacy}":"bad"}`))).toBe(false); });
  it.each(['owner', 'admin'])('真实%s可写，不依赖tag/eligibility', async role => { const f = fixture('{}'); f.state.actorRole = role; await expect(setLedger37AiDisplay(setter)).resolves.toEqual({ success: true, aiEnabled: true }); expect(f.log.some(r => /categories|participations|matrix/.test(r.sql))).toBe(false); });
  it('普通actor禁写、系统管理员可写，代看另一admin仍无管理权限', async () => { const f = fixture('{}'); f.state.actorRole = 'member'; await expect(setLedger37AiDisplay(setter)).rejects.toThrow('管理员'); await setLedger37AiDisplay({ ...setter, systemRole: 'systemadmin' }); f.state.viewerRole = 'admin'; expect((await getLedger37PresentationContext({ ...self, systemRole: 'admin', isViewingAs: true })).canManage).toBe(false); await expect(setLedger37AiDisplay({ ...setter, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('代看'); });
  it('target非member拒绝、读取非member拒绝，不误封其他账本stockoverview', async () => { const f = fixture('{}'); f.state.targetExists = false; await expect(setLedger37AiDisplay(setter)).rejects.toThrow('目标用户'); await expect(getLedger37PresentationContext(self)).rejects.toThrow('成员'); expect(await getMyStockTagOverview({ ledgerId: 52, userId: 201 })).toEqual([]); expect(f.writes()).toHaveLength(0); });
  it.each(['DEV_BYPASS_AUTH', 'PREVIEW_READONLY'])('%s禁止setter且不连DB', async name => { fixture('{}'); vi.stubEnv(name, 'true'); await expect(setLedger37AiDisplay(setter)).rejects.toThrow('只读预览'); expect(deps.tx).not.toHaveBeenCalled(); });
  it('锁序ledger→members，precision/旧flag/全部兄弟字节无损，仅单key，重复幂等', async () => {
    const raw = ` { "huge":900719925474099312345, "coin":2.123456789123456789, "${legacy}" : 1, "绝密R1__startDate":"2020-01-01" } `;
    const f = fixture(raw); await setLedger37AiDisplay(setter); await setLedger37AiDisplay(setter);
    expect(f.log.slice(0, 2).map(r => r.sql.match(/FROM (\w+)/)![1])).toEqual(['ledgers', 'ledger_members']); expect(f.log.slice(0, 2).every(r => /FOR UPDATE/.test(r.sql))).toBe(true);
    expect(f.state.raw).toBe(raw.replace(' }', ` ,"${key}":1}`)); expect(f.writes()).toHaveLength(1); expect(f.writes()[0].sql.replace(/UPDATE|updatedAt/g, '')).not.toMatch(/JSON_SET|wallet|amount|date|share/i);
  });
  it('CAS失败和commit失败回滚，连接释放', async () => { const f = fixture('{}'); f.state.affectedRows = 0; await expect(setLedger37AiDisplay(setter)).rejects.toThrow('已变化'); expect(f.state.raw).toBe('{}'); f.state.affectedRows = 1; f.state.failCommit = true; await expect(setLedger37AiDisplay(setter)).rejects.toThrow('commit'); expect(f.state.raw).toBe('{}'); expect(f.conn.release).toHaveBeenCalledTimes(2); });
  it('generic patch禁止新key，旧setter始终拒绝且不读写', async () => { const f = fixture(); await expect(updateLedger37InitialBalances(f.conn, 201, { [key]: 1 })).rejects.toThrow('AI展示专用'); await expect(setR1StockAiDisplay({ ...setter, categoryId: 90250 })).rejects.toThrow('使用账本全局AI设置'); expect(f.log).toHaveLength(0); });
});

describe('全账本安全目录与全stockguard', () => {
  it('两个股票+两个ordinary保留本人已算摘要/实收，不输出任何prices/原名/他人/备注', async () => {
    const f = fixture(); const result = await getMyLedger37AiOverview(self); safe(result);
    expect(result.projects.map(p => [p.categoryId, p.kind, p.displayName])).toEqual([[90250, 'stock', '股票项目90250'], [90251, 'stock', '股票项目90251'], [90300, 'ordinary', '参与项目90300'], [90301, 'ordinary', '参与项目90301']]);
    expect(result.projects[0].summary).toEqual({ floatingPnl: 120, realizedPnl: 40, totalPnl: 160 }); expect(result.projects[1].summary).toEqual(result.projects[0].summary);
    expect(result.projects[2]).toMatchObject({ summary: null, receivedDividends: 23.45, startDate: '2024-01-02', recordedMargins: [{ assetCode: 'CNY', amount: '123.123456789123456789' }] });
    expect(result.projects[3]).toMatchObject({ summary: null, receivedDividends: -2.5, recordedMargins: [], startDate: null });
    expect(f.log.every(r => /^\s*SELECT/.test(r.sql))).toBe(true); expect(deps.crypto).not.toHaveBeenCalled(); expect(deps.tx).not.toHaveBeenCalled();
  });
  it('两个stock详情仍原R1 DTO，safe行和收益方向不改', async () => { fixture(); for (const categoryId of [90250, 90251]) { const result = await getMyR1AiParticipationPortfolio({ ...self, categoryId }); safe(result); expect(result.summary.totalPnl).toBe(160); expect(result.participations[0]).toMatchObject({ quantity: 60, allocatedQuantity: 100, floatingPnl: 120, realizedPnl: 40 }); } });
  it('hidden股票与ordinary不从缓存恢复，项目编号不受标签重排影响', async () => { const f = fixture(); await getMyLedger37AiOverview(self); f.state.raw = JSON.stringify({ [key]: 1, '绝密R1__visible': 0, '绝密普通甲__visible': 0 }); const result = await getMyLedger37AiOverview(self); expect(result.projects.map(p => p.categoryId)).toEqual([90251, 90301]); safe(result); });
  it.each([getStockTagPortfolio, getStockTagPublicPortfolio, getMyStockTagParticipantPortfolio, getStockTagDailySnapshots, getStockTagCalendar, getMyStockTagObservationPortfolio, getStockLotParticipationMatrix])('%s对两个stock均先globalguard拒绝', async reader => { const f = fixture(); for (const categoryId of [90250, 90251]) await expect(reader({ ...self, categoryId })).rejects.toThrow('安全参与收益接口'); expect(f.log).toHaveLength(2); expect(f.log.every(r => /LEFT JOIN ledger_members/.test(r.sql))).toBe(true); });
  it('globalfalse即使遗留tagtrue可走旧calendar，实际管理员raw，代看另一admin不提权', async () => { const f = fixture(`{"${key}":0,"${legacy}":1}`); expect(await getStockTagCalendar({ ...self, categoryId: 90251 })).toEqual([]); f.state.raw = `{"${key}":1}`; expect(await getStockTagCalendar({ ...self, categoryId: 90251, systemRole: 'admin' })).toEqual([]); f.state.viewerRole = 'admin'; await expect(getStockTagCalendar({ ...self, categoryId: 90251, isViewingAs: true, systemRole: 'admin' })).rejects.toThrow('安全参与收益接口'); });
  it('safe目录与详情仍eligibility guard，无真实参与仅合法observer可进', async () => { const f = fixture(); f.state.noParticipations = true; expect(await getMyLedger37SafeStockDirectory(self)).toEqual([]); await expect(getMyR1AiParticipationPortfolio({ ...self, categoryId: 90251 })).rejects.toThrow('尚未对您开放'); f.state.observer = true; const result = await getMyLedger37SafeStockDirectory(self); expect(result).toHaveLength(2); safe(result); expect(f.log.every(r => /^\s*SELECT/.test(r.sql))).toBe(true); });
  it('stockoverview与观察目录全stock匿名，无硬编码R1投影范围', async () => { const f = fixture(); const result = await getMyStockTagOverview(self); expect(result).toHaveLength(2); safe(result); expect(result.map(r => r.name)).toEqual(['股票项目90250', '股票项目90251']); f.state.observer = true; const observation = await getMyStockTagObservationOverview(self); expect(observation.categories[0].categoryName).toBe('股票项目90251'); });
  it('读取失败不能fallback，globalfalse无admin不能读取AI安全目录', async () => { const f = fixture('{}'); await expect(getMyLedger37AiOverview(self)).rejects.toThrow('尚未开启'); f.state.failRead = true; await expect(getLedger37PresentationContext(self)).rejects.toThrow('read failed'); });
  it('新服务不使用BigInt字面量或Map迭代导致ES5新增错误', () => { const source = readFileSync(new URL('./ledger37-ai-presentation.ts', import.meta.url), 'utf8'); const ast = ts.createSourceFile('service.ts', source, ts.ScriptTarget.Latest, true); expect(ast.parseDiagnostics).toHaveLength(0); expect(source).not.toMatch(/\d+n\b|JSON_SET|CREATE TABLE|ALTER TABLE/); });
});
