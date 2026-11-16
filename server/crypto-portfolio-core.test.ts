import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as instruments from '../shared/portfolio-instruments';
import * as policy from '../shared/crypto-portfolio-policy';
import * as observations from '../shared/stock-observation-portfolio';
import * as ordering from '../shared/stock-trade-ordering';
import { mergeCryptoPortfolioCalendarSnapshots } from './shared/crypto-portfolio-calendar-integration';
import { guardCryptoPortfolioAllocationWrite } from './crypto-portfolio-allocation-write-guard';

// 执行真实核心完整函数体；仅移除imports，以注入全部mock依赖。
// 不import数据库/扫描器入口，不建立真实连接，不执行真实DDL或启动服务。
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('core.ts', source, ts.ScriptTarget.Latest, true);
const text = ast.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getFullText(ast)).join('\n');
const javascript = ts.transpileModule(text.replace(/\bexport\s+/g, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const exposed = ['normalizeSymbol', 'stockCurrency', 'stockMarket', 'validateCryptoQuantity', 'parsePortfolioActualTime',
  'portfolioRemainingQuantity', 'portfolioQuantityExceeds', 'summarizePositionsByCurrency', 'summarizePositionsInCny',
  'getRealizedPnl', 'getLiveCryptoQuotes', 'mergeLivePortfolioQuoteMaps', 'verifyStockForTrade',
  'ensureLedgerStockPortfolioTables', 'widenPortfolioIdentityColumns', 'buildPortfolio', 'buildMemberStockPortfolio',
  'createStockTagEvent', 'allocateWholeLot', 'closeLotParticipationsFifo', 'saveStockSaleProfitAllocations',
  'getStockLotParticipationMatrix', 'setStockLotParticipation', 'setStockLotObservation',
  'buildPortfolioObservationHolding', 'summarizePortfolioObservationHoldings'];
const NOW = new Date('2026-11-15T08:00:00Z');
const BTC = 'CRYPTO:BTC-USDT';
function spot(symbol = BTC, price = 110) {
  return { symbol, price, currency: 'USDT', source: 'Gate.io', updatedAt: NOW.toISOString(), priceDate: '2026-11-15' };
}
function lot(symbol = BTC, quantity = 1e-8) {
  return { id: 101, symbol, stock_name: 'Bitcoin', opened_event_id: 10, opened_at: '2026-11-14 10:00:00',
    initial_quantity: quantity, allocated_quantity: 0, unit_cost: 100, opening_fee: null, note: '' };
}
function setup(options: { symbol?: string; quantity?: number; fx?: number | null; memberRole?: string; hidden?: boolean } = {}) {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  const selected = lot(options.symbol, options.quantity);
  const realized: any[] = [];
  const execute = vi.fn(async (sql: string) => {
    if (sql.includes('information_schema.columns')) return [[{ COLUMN_NAME: 'accounting_mode' }, { COLUMN_NAME: 'transaction_fee' },
      { COLUMN_NAME: 'note' }, { COLUMN_NAME: 'pause_date' }, { COLUMN_NAME: 'start_date' }, { COLUMN_NAME: 'settlement_effective_date' }]];
    if (sql.includes('information_schema.tables')) return [[]];
    if (sql.includes('FROM ledger_categories c')) return [[{ id: 301, ledgerId: 37, name: '组合', parentId: null,
      accounting_mode: 'stock_portfolio', member_user_id: 201, member_role: options.memberRole || 'admin',
      initialBalances: options.hidden ? JSON.stringify({ '组合': { tagVisible: false } }) : '{}' }]];
    if (sql.includes('FROM ledger_stock_lots l') && sql.includes('allocated_quantity')) return [[selected]];
    if (sql.includes('allocated_cost')) return [realized];
    if (sql.includes('FROM ledger_stock_events e') && sql.includes('market_reference_price')) return [[{
      symbol: selected.symbol, market_reference_price: 999, market_reference_at: NOW.toISOString(),
    }]];
    if (sql.includes('FROM ledger_stock_price_snapshots')) return [[{ symbol: selected.symbol, price: 888, price_date: '2026-11-15', captured_at: NOW.toISOString() }]];
    if (sql.includes('FROM ledger_stock_intraday_quotes')) return [[{ symbol: selected.symbol, price: 777, price_date: '2026-11-15', captured_at: NOW.toISOString() }]];
    return [[]];
  });
  const txExecute = vi.fn(async (sql: string) => {
    if (sql.includes('INSERT INTO ledger_stock_events')) return [{ insertId: 1001 }];
    if (sql.includes("l.symbol LIKE 'CRYPTO:%-USDT'")) return [instruments.isCryptoPortfolioSymbol(selected.symbol) ? [{
      id: selected.id, ledger_id: 37, category_id: 301, symbol: selected.symbol,
      actual_traded_at: selected.opened_at, registered_at: '2026-11-15 16:00:00', effective_date: '2026-11-16',
    }] : []];
    if (sql.includes('FROM ledger_crypto_portfolio_daily_snapshots')) return [[]];
    if (sql.includes('FROM ledger_stock_lots l')) return [[selected]];
    if (sql.includes('FROM ledger_members')) return [[{ userId: 201 }]];
    if (sql.includes('globally_sold_quantity')) return [[{ globally_sold_quantity: 0 }]];
    if (sql.includes('allocated_quantity') && sql.includes('SUM')) return [[{ allocated_quantity: 0 }]];
    return [[]];
  });
  const tx = { execute: txExecute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  const fetchQuotes = vi.fn(async (symbols: string[]) => Object.fromEntries(symbols.map((symbol) => [symbol, spot(symbol)])));
  const cached = vi.fn(() => null as any);
  const searchCrypto = vi.fn(async (symbol: string) => ({ results: [{ symbol, name: 'Bitcoin', market: 'CRYPTO', currency: 'USDT', latestPrice: 110 }] }));
  const searchStocks = vi.fn(async (symbol: string) => [{ symbol, name: symbol, latestPrice: 110, latestPriceUpdatedAt: NOW.toISOString() }]);
  const fx = vi.fn(async () => options.fx == null ? null : { rate: options.fx, source: 'independent-usdt-usd-composite',
    asOf: '2026-11-13T07:05:00Z', pair: 'USDT/CNY', stale: false, carried: true });
  const activation = vi.fn(async () => null as string | null);
  const cryptoCalendar = vi.fn(async () => [] as any[]);
  const deps = { ...instruments, ...policy, ...observations, ...ordering,
    getDbConnection: vi.fn(async () => ({ execute })), getDbTransactionConnection: vi.fn(async () => tx),
    fetchCryptoPortfolioQuotes: fetchQuotes, getCachedCryptoPortfolioQuote: cached, searchCryptoPortfolio: searchCrypto,
    searchManualStocks: searchStocks, getLiveCryptoUsdtCnyQuote: fx, getUsdtCnyRate: () => 7,
    readTagVisible: (_balances: any) => !options.hidden, resolveUsStockExchange: () => null,
    ensureStockCalendarResultTable: vi.fn(), markStockCalendarResultDirty: vi.fn(), readStockCalendarResult: vi.fn(async () => []),
    rebuildCachedStockCalendarResult: vi.fn(async () => ({ status: 'up-to-date' })),
    marketSessionDateFromBeijingTradeTimestamp: () => '2026-11-14',
    buildMemberStockCalendar: () => [], memberCalendarSettlementSummary: () => ({}),
    mergeCryptoPortfolioCalendarSnapshots, getCryptoPortfolioActivationDate: activation, readCryptoPortfolioCalendar: cryptoCalendar,
    guardCryptoPortfolioAllocationWrite,
  };
  const core = new Function(...Object.keys(deps), `${javascript}\nreturn { ${exposed.join(',')} };`)(...Object.values(deps));
  return { core, execute, txExecute, tx, fetchQuotes, cached, searchCrypto, searchStocks, fx, selected, realized, activation, cryptoCalendar };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const input = { ledgerId: 37, categoryId: 301, userId: 201, eventType: 'buy', symbol: BTC,
  quantity: 1e-8, executionPrice: 100, actualTradedAt: '2026-11-14 10:00:00' };

describe('37数字币现货核心：真实函数、离线DB/quotes', () => {
  it('显式数字币身份和长base保留，裸ETH仍是美股；资金及合约身份拒绝', async () => {
    const { core, searchCrypto, searchStocks } = setup();
    expect(core.stockMarket(core.normalizeSymbol(' crypto:btc-usdt '))).toBe('CRYPTO');
    expect(core.stockCurrency(BTC)).toBe('USDT');
    expect(core.normalizeSymbol(`CRYPTO:${'A'.repeat(30)}-USDT`)).toHaveLength(42);
    expect(core.stockMarket('ETH')).toBe('US'); expect(core.stockCurrency('ETH')).toBe('USD');
    for (const symbol of ['CRYPTO:USDT-USDT', 'CRYPTO:BTC-PERP', 'CRYPTO:BTC-USDT:PERP']) expect(() => core.normalizeSymbol(symbol)).toThrow();
    await core.verifyStockForTrade(BTC); expect(searchCrypto).toHaveBeenCalledWith(BTC); expect(searchStocks).not.toHaveBeenCalled();
    await core.verifyStockForTrade('ETH'); expect(searchStocks).toHaveBeenCalledWith('ETH', 'US');
  });
  it.each([0, -1, 1e-9, 1.0001e-8, 0.123456789, Infinity, NaN])('新数字币数量拒绝 %s', (quantity) => {
    const { core } = setup(); expect(() => core.validateCryptoQuantity(BTC, quantity)).toThrow();
  });
  it('最低1e-8保留、余量按8位处理；原股票输入规则不变', () => {
    const { core } = setup();
    expect(() => core.validateCryptoQuantity(BTC, 1e-8)).not.toThrow();
    expect(() => core.validateCryptoQuantity(BTC, 0, true)).not.toThrow();
    expect(() => core.validateCryptoQuantity('ETH', 0.123456789)).not.toThrow();
    expect(core.portfolioRemainingQuantity(BTC, 0.3, 0.29999999)).toBe(1e-8);
    expect(core.portfolioQuantityExceeds(BTC, 1e-8)).toBe(true);
    expect(core.portfolioQuantityExceeds('AAPL', 1e-8)).toBe(false);
  });
  it('未知USDT汇率不会复用USD或人民币，unknown行情数量贯穿', () => {
    const { core } = setup();
    const rows = [{ currency: 'CNY', costValue: 10, marketValue: 11, floatingPnl: 1 },
      { currency: 'USD', costValue: 20, marketValue: 22, floatingPnl: 2 },
      { currency: 'USDT', costValue: 30, marketValue: null, floatingPnl: null }];
    expect(core.summarizePositionsByCurrency(rows).map((row: any) => row.currency)).toEqual(['CNY', 'USD', 'USDT']);
    expect(core.summarizePositionsInCny(rows, 7, null)).toMatchObject({ costValue: null, marketValue: null, floatingPnl: null, fxUnavailable: true, unpricedPositionCount: 1 });
    expect(core.summarizePositionsInCny([{ currency: 'USDT', costValue: 30, marketValue: 33, floatingPnl: 3 }], 7, 8)).toMatchObject({ costValue: 240, marketValue: 264, floatingPnl: 24 });
  });
  it('已实现币收益原币金额正确，USDT缺FX返回null而非CNY/USD；股票旧费率保留', async () => {
    const { core, realized } = setup();
    realized.push({ symbol: BTC, quantity: 2, execution_price: 110, transaction_fee: 0.22, allocated_cost: 200, allocated_buy_fee: 0.2 });
    expect(await core.getRealizedPnl(301, 7, null)).toBeNull();
    expect(await core.getRealizedPnl(301, 7, 8)).toBeCloseTo(19.58 * 8);
    realized.splice(0, 1, { symbol: 'AAPL', quantity: 2, execution_price: 110, transaction_fee: null, allocated_cost: 200, allocated_buy_fee: 0 });
    expect(await core.getRealizedPnl(301, 7, null)).toBe(140);
  });
  it('管理员最低数量组合不消失；缺USDTFX所有人民币金额保持null', async () => {
    const { core } = setup(); const portfolio = await core.buildPortfolio(301);
    expect(portfolio.positions).toHaveLength(1);
    expect(portfolio.positions[0]).toMatchObject({ quantity: 1e-8, currency: 'USDT', market: 'CRYPTO', marketPrice: 110, averageCost: 100 });
    expect(portfolio.summary).toMatchObject({ usdtCnyRate: null, costValue: null, marketValue: null, floatingPnl: null, totalPnl: null });
    expect(portfolio.summary.currencySummaries[0]).toMatchObject({ currency: 'USDT', marketValue: 0.0000011 });
  });
  it('真实周末carry汇率接受；币值换算只用USDT腿', async () => {
    const { core } = setup({ fx: 8, quantity: 2 }); const portfolio = await core.buildPortfolio(301);
    expect(portfolio.summary).toMatchObject({ usdtCnyRate: 8, costValue: 1600, marketValue: 1760, floatingPnl: 160 });
  });
  it('实时数字币缺价不回退旧收盘/登记参考价；股票仍保留旧优先级', async () => {
    const crypto = setup(); crypto.fetchQuotes.mockResolvedValue({}); const empty = await crypto.core.buildPortfolio(301);
    expect(empty.positions[0].marketPrice).toBeNull(); expect(empty.summary.unpricedPositionCount).toBe(1);
    const stock = setup({ symbol: 'ETH', quantity: 2 }); const legacy = await stock.core.buildPortfolio(301);
    expect(legacy.positions[0].marketPrice).toBe(777); expect(stock.fetchQuotes).not.toHaveBeenCalled();
  });
  it.each(['contract_mark', 'crypto_close_gate_1505', 'unverified'])('标记价/旧日结来源 %s 不得作为实时报价', async (source) => {
    const { core, fetchQuotes } = setup(); fetchQuotes.mockResolvedValue({ [BTC]: { ...spot(), source } });
    expect(await core.getLiveCryptoQuotes([BTC])).toEqual({});
  });
  it('过期报价拒绝；同symbol并发请求single-flight且只取crypto', async () => {
    const { core, fetchQuotes, cached } = setup();
    cached.mockReturnValue({ ...spot(), updatedAt: '2026-11-15T07:00:00Z' });
    let done!: (value: any) => void; fetchQuotes.mockImplementation(() => new Promise((resolve) => { done = resolve; }));
    const first = core.getLiveCryptoQuotes([BTC, 'ETH']); const second = core.getLiveCryptoQuotes([BTC]);
    await Promise.resolve(); expect(fetchQuotes).toHaveBeenCalledTimes(1); expect(fetchQuotes).toHaveBeenCalledWith([BTC]);
    done({ [BTC]: spot() }); expect(await first).toEqual(await second);
  });
  it('有效fresh缓存无需fetch，缺目录/报价阻止登记', async () => {
    const { core, cached, fetchQuotes, searchCrypto } = setup(); cached.mockReturnValue(spot());
    await core.getLiveCryptoQuotes([BTC]); expect(fetchQuotes).not.toHaveBeenCalled();
    searchCrypto.mockResolvedValue({ results: [] }); await expect(core.verifyStockForTrade(BTC)).rejects.toThrow('核验');
  });
  it('交易实际时间按北京解析，拒绝未来事件且不开始交易；迟登记保存max日结生效日', async () => {
    const { core, tx, txExecute } = setup();
    expect(core.parsePortfolioActualTime('2026-11-14 10:00:00', NOW).toISOString()).toBe('2026-11-14T02:00:00.000Z');
    await expect(core.createStockTagEvent({ ...input, actualTradedAt: '2026-11-15 17:00:00' })).rejects.toThrow('不能晚于');
    expect(tx.beginTransaction).not.toHaveBeenCalled();
    expect(await core.createStockTagEvent(input)).toEqual({ id: 1001 });
    const insert = txExecute.mock.calls.find(([sql]) => sql.includes('INSERT INTO ledger_stock_events'))! as any;
    expect(insert[0]).toContain('settlement_effective_date');
    expect(insert[1][8]).toBe('2026-11-14 10:00:00'); expect(insert[1][14]).toBe('2026-11-16');
    expect(insert[1][15]).toBe('2026-11-15 16:00:00'); expect(insert[1][7]).toBe(0);
  });
  it('新股票交易保持NULL生效日与千分之一费用', async () => {
    const { core, txExecute } = setup({ symbol: 'AAPL', quantity: 2 });
    await core.createStockTagEvent({ ...input, symbol: 'AAPL', quantity: 2 });
    const insert = txExecute.mock.calls.find(([sql]) => sql.includes('INSERT INTO ledger_stock_events'))! as any;
    expect(insert[1][14]).toBeNull(); expect(insert[1][7]).toBe(0.2);
  });
  it('最低币量可整笔卖出、最小参与closure不会消失，股票1e-8仍按旧空仓规则', async () => {
    const { core, txExecute } = setup();
    await core.allocateWholeLot({ execute: txExecute }, 1001, 301, 101, BTC, 1e-8, 110);
    expect(txExecute.mock.calls.some(([sql]) => sql.includes('INSERT INTO ledger_stock_event_lot_allocations'))).toBe(true);
    const execute = vi.fn(async (sql: string) => sql.includes('SELECT id, remaining_quantity') ? [[{ id: 901, remaining_quantity: 1e-8 }]] : [[]]);
    await core.closeLotParticipationsFifo({ execute }, 101, 1001, 110, 1e-8, BTC);
    expect(execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO ledger_stock_participation_closures'))).toBe(true);
    await expect(core.allocateWholeLot({ execute: txExecute }, 1001, 301, 101, BTC, 2e-8, 110)).rejects.toThrow('整笔');
  });
  it('成员分配保存最小币量，不误DELETE；权限与37账本边界保持', async () => {
    const { core, txExecute } = setup();
    await core.setStockLotParticipation({ ledgerId: 37, categoryId: 301, userId: 201, lotId: 101, targetUserId: 201, quantity: 1e-8 });
    expect(txExecute.mock.calls.some(([sql]) => sql.includes('INSERT INTO ledger_stock_lot_participations'))).toBe(true);
    const member = setup({ memberRole: 'member' });
    await expect(member.core.createStockTagEvent(input)).rejects.toThrow('管理员');
    await expect(member.core.getStockLotParticipationMatrix({ ledgerId: 37, categoryId: 301, userId: 201 })).rejects.toThrow('管理员');
    await expect(core.createStockTagEvent({ ...input, ledgerId: 52 })).rejects.toThrow('37号');
    const hidden = setup({ memberRole: 'member', hidden: true }); await expect(hidden.core.createStockTagEvent(input)).rejects.toThrow('无权');
  });
  it('迁移只检测并扩窄symbol/currency，不缩列、不UPDATE/DELETE现存内容', async () => {
    const { core } = setup();
    const execute = vi.fn(async (_sql: string) => [[
      { TABLE_NAME: 'ledger_stock_events', COLUMN_NAME: 'symbol', CHARACTER_MAXIMUM_LENGTH: 16, IS_NULLABLE: 'YES' },
      { TABLE_NAME: 'ledger_stock_lots', COLUMN_NAME: 'symbol', CHARACTER_MAXIMUM_LENGTH: 128, IS_NULLABLE: 'NO' },
      { TABLE_NAME: 'ledger_stock_sale_profit_allocations', COLUMN_NAME: 'currency', CHARACTER_MAXIMUM_LENGTH: 3, IS_NULLABLE: 'NO' },
      { TABLE_NAME: 'other_table', COLUMN_NAME: 'symbol', CHARACTER_MAXIMUM_LENGTH: 16, IS_NULLABLE: 'NO' },
    ]]);
    await core.widenPortfolioIdentityColumns({ execute }, ['ledger_stock_events', 'ledger_stock_lots', 'ledger_stock_sale_profit_allocations']);
    const queries = execute.mock.calls.map(([sql]) => sql);
    expect(queries).toHaveLength(3); expect(queries[1]).toBe('ALTER TABLE ledger_stock_events MODIFY COLUMN symbol VARCHAR(64) NULL');
    expect(queries[2]).toBe('ALTER TABLE ledger_stock_sale_profit_allocations MODIFY COLUMN currency VARCHAR(4) NOT NULL');
    expect(queries.join(' ')).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i);
    expect(source).toContain('settlement_effective_date DATE NULL');
  });
  it('观察USDT原币及币种矩阵不会错标USD，成员对手盘方向保持', () => {
    const { core } = setup();
    const row = core.buildPortfolioObservationHolding({ lotId: 101, symbol: BTC, stockName: 'Bitcoin', enabled: true,
      quantity: 1e-8, entryPrice: 100, startDate: '2026-11-14', initialQuantity: 1e-8, lotCurrentQuantity: 1e-8,
      soldQuantity: 0, soldValue: 0 }, { price: 110, updatedAt: NOW.toISOString(), priceDate: '2026-11-15', source: 'intraday' }, '2026-11-15');
    expect(row).toMatchObject({ currency: 'USDT', market: 'CRYPTO', currentQuantity: 1e-8 });
    expect(row.floatingPnl).toBeCloseTo(-1e-7);
    expect(core.summarizePortfolioObservationHoldings([row])).toMatchObject({ reportingCurrency: 'USDT', isMixedCurrency: false });
    expect(core.summarizePortfolioObservationHoldings([row, { ...row, currency: 'CNY' }])).toMatchObject({ reportingCurrency: null, totalPnl: null, isMixedCurrency: true });
  });
  it('成员最低币量和已实现利润原币不混淆，账户对手盘方向保持且USDTFX缺失null', async () => {
    const { core, execute } = setup();
    const base = execute.getMockImplementation()!;
    execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT p.id, p.lot_id')) return [[{ id: 901, lot_id: 101, symbol: BTC, stock_name: 'Bitcoin',
        allocated_quantity: 2e-8, remaining_quantity: 1e-8, entry_price: 100, initial_quantity: 2e-8,
        opened_at: '2026-11-14 10:00:00', start_date: '2026-11-14', opening_actual_traded_at: '2026-11-14 10:00:00',
        closed_quantity: 1e-8, closed_value: 0.0000011, realized_pnl: -0.0000001 }]];
      return base(sql);
    });
    const member = await core.buildMemberStockPortfolio(301, 201);
    expect(member.positions).toHaveLength(1);
    expect(member.positions[0]).toMatchObject({ quantity: 1e-8, currency: 'USDT', market: 'CRYPTO', marketPrice: 110, averageCost: 100 });
    expect(member.positions[0].floatingPnl).toBeCloseTo(-0.0000001);
    expect(member.participations[0].realizedPnl).toBe(-0.0000001);
    expect(member.summary.realizedPnl).toBeNull(); expect(member.summary.usdtCnyRate).toBeNull();
  });
  it('卖出最小币量的成员收益快照保留USDT与对手盘方向，双边千分之一不改', async () => {
    const { core } = setup();
    const execute = vi.fn(async (sql: string, _params?: any[]) => {
      if (sql.includes('FROM ledger_stock_lots l')) return [[{ symbol: BTC, initial_quantity: 1e-8, unit_cost: 100, opening_fee: null }]];
      if (sql.includes('FROM ledger_stock_participation_closures c')) return [[{ participation_id: 901, user_id: 201, member_name: '成员', closed_quantity: 1e-8 }]];
      return [[]];
    });
    await core.saveStockSaleProfitAllocations({ execute }, { lotId: 101, sellEventId: 1001,
      quantity: 1e-8, salePrice: 90, sellFee: 9e-10, createdBy: 201 });
    const insert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO ledger_stock_sale_profit_allocations'))!;
    expect(insert[1]![5]).toBe(1e-8); expect(insert[1]![6]).toBe(100);
    expect(insert[1]![7]).toBeGreaterThan(0); expect(insert[1]![8]).toBe('USDT');
  });
  it('冷目录及主源超时后的HTX报价超过旧6秒仍在总预算内返回，不提前丢失备用', async () => {
    const { core, fetchQuotes } = setup();
    fetchQuotes.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ [BTC]: { ...spot(), source: 'HTX' } }), 24_000);
    }));
    let finished = false;
    const pending = core.getLiveCryptoQuotes([BTC]).then((quotes: any) => { finished = true; return quotes; });
    await vi.advanceTimersByTimeAsync(6_001);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(18_000);
    expect(await pending).toMatchObject({ [BTC]: { price: 110, providerSource: 'HTX' } });
    expect(fetchQuotes).toHaveBeenCalledTimes(1);
  });
  it('fresh请求超时有界且保留未知，失败single-flight释放', async () => {
    const { core, fetchQuotes } = setup(); fetchQuotes.mockImplementation(() => new Promise(() => {}));
    const pending = core.getLiveCryptoQuotes([BTC]); await vi.advanceTimersByTimeAsync(28_001);
    expect(await pending).toEqual({});
    fetchQuotes.mockImplementation(async (symbols) => Object.fromEntries(symbols.map((symbol) => [symbol, spot(symbol)])));
    expect(await core.getLiveCryptoQuotes([BTC])).toHaveProperty(BTC);
  });
});
