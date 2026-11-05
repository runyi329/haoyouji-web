import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStockObservationHolding,
  summarizeStockObservationHoldings,
  releaseStockParticipationForObservation,
  validateStockObservationQuantity,
  validateStockObservationEntryPrice,
  validateStockObservationStartDate,
  validateStockObservationPauseDate,
  type StockLotObservation,
  type StockObservationQuote,
} from '../shared/stock-observation-portfolio';

// 所有服务测试都替换数据库和行情模块，不创建真实连接、不写生产。
// 观察读写禁止DDL；真实分配原有ensure仅由mock接收，不实际建表。
const mocks = vi.hoisted(() => ({
  execute: vi.fn(), txExecute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
}));
vi.mock('./db', () => ({
  getDbConnection: vi.fn(async () => ({ execute: mocks.execute })),
  getDbTransactionConnection: vi.fn(async () => ({
    execute: mocks.txExecute, beginTransaction: mocks.begin, commit: mocks.commit,
    rollback: mocks.rollback, release: mocks.release,
  })),
}));
vi.mock('./price-scanner', () => ({
  fetchIntradayStockQuotes: vi.fn(), getUsdtCnyRate: vi.fn(), refreshUsdtCnyRate: vi.fn(),
  resolveUsStockExchange: vi.fn(), searchManualStocks: vi.fn(),
}));
import {
  createStockTagEvent,
  voidStockTagEvent,
  refreshLedgerStockTagIntradaySnapshots,
  refreshLedgerStockTagCloseSnapshots,
  getMyStockTagObservationPortfolio,
  getMyStockTagObservationOverview,
  getStockLotParticipationMatrix,
  getStockObservationPauseContext,
  getMyStockTagParticipantPortfolio,
  getMyStockTagOverview,
  setStockLotObservation,
  setStockLotParticipation,
} from './ledger-stock-portfolio';
import { fetchIntradayStockQuotes, searchManualStocks } from './price-scanner';

const today = '2026-11-05';
const quote: StockObservationQuote = { price: 8, priceDate: today, updatedAt: `${today}T01:00:00.000Z`, source: 'intraday' };
function observation(overrides: Partial<StockLotObservation> = {}): StockLotObservation {
  return {
    lotId: 101, userId: 201, enabled: true, quantity: 1000, entryPrice: 10, startDate: '2026-10-01',
    assignedBy: 1, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    symbol: '600000.SH', stockName: '测试股票', initialQuantity: 100, lotCurrentQuantity: 100,
    soldQuantity: 0, soldValue: null, soldAt: null, soldDate: null, ...overrides,
  };
}
function holding(overrides: Partial<StockLotObservation> = {}, selectedQuote: StockObservationQuote | null = quote) {
  return buildStockObservationHolding(observation(overrides), selectedQuote, today)!;
}

const accessInput = { ledgerId: 37, categoryId: 301, userId: 201 };
const categoryRow = { id: 301, ledgerId: 37, name: '阿一', parentId: null, accounting_mode: 'stock_portfolio' };
const lotRow = { id: 101, unit_cost: '10', opened_at: '2026-10-01' };
const dbObservation = {
  lot_id: 101, user_id: 201, enabled: 1, quantity: '1000', entry_price: '10', start_date: '2026-10-01',
  assigned_by: 1, created_at: '2026-10-01', updated_at: '2026-10-01',
  symbol: '600000.SH', stock_name: '测试股票', initial_quantity: '100', sold_quantity: '0',
  sold_value: null, sold_at: null, sold_date: null,
};
function installReadMock({ exists = true, role = 'admin', observations = [dbObservation] }: {
  exists?: boolean; role?: string; observations?: Array<Record<string, unknown>>;
} = {}) {
  mocks.execute.mockImplementation(async (sql: string) => {
    if (sql.includes('information_schema.tables') && sql.includes("'ledger_stock_quote_history'")) return [[]];
    if (sql.includes('information_schema.tables')) return [exists ? [{ TABLE_NAME: 'ledger_stock_lot_observations' }] : []];
    if (sql.includes('FROM ledger_categories') && !sql.includes('COUNT')) return [[categoryRow]];
    if (sql.includes('FROM ledger_members') && sql.includes('initial_balances')) return [[{ role, initialBalances: '{}' }]];
    if (sql.includes('FROM ledger_stock_lot_observations o') && sql.includes('COUNT(DISTINCT')) return [[{ id: 301, holding_count: observations.length }]];
    if (sql.includes('FROM ledger_stock_lot_observations o')) return [observations];
    if (sql.includes('FROM ledger_stock_events e') && sql.includes('market_reference_price')) {
      return [[{ symbol: '600000.SH', market_reference_price: '11', market_reference_at: '2026-10-01T01:00:00Z' }]];
    }
    if (sql.includes('FROM ledger_stock_price_snapshots')) return [[{ symbol: '600000.SH', price: '9', price_date: today, captured_at: `${today}T00:00:00Z` }]];
    if (sql.includes('FROM ledger_stock_intraday_quotes')) return [[{ symbol: '600000.SH', price: '8', price_date: today, captured_at: `${today}T01:00:00Z` }]];
    throw new Error(`Unexpected SQL (test forbids DDL and real portfolio reads): ${sql}`);
  });
}

const pauseDate = '2026-11-02';
function installPauseReadMock({ soldQuantity = 40, soldValue = 360, unpriced = false, exists = true }: {
  soldQuantity?: number; soldValue?: number | null; unpriced?: boolean; exists?: boolean;
} = {}) {
  installReadMock({ exists, observations: [{ ...dbObservation, pause_date: pauseDate,
    sold_quantity: '100', sold_value: '1100', sold_at: '2026-11-04', sold_date: '2026-11-04' }] });
  const base = mocks.execute.getMockImplementation()!;
  mocks.execute.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM ledger_stock_lots l') && sql.includes('DATE_ADD(?, INTERVAL 1 DAY)')) {
      expect(params).toEqual([pauseDate, 101, 37]);
      return [[{ id: 101, category_id: 301, symbol: '600000.SH', initial_quantity: 100,
        sold_quantity: soldQuantity, sold_value: soldValue, sold_at: soldQuantity > 0 ? '2026-11-01T01:00:00Z' : null }]];
    }
    if (sql.includes('DATE_ADD(?, INTERVAL 1 DAY)') && sql.includes('market_reference_price')) {
      expect(params).toEqual([301, pauseDate, 301]);
      return [unpriced ? [] : [{ symbol: '600000.SH', market_reference_price: 11, market_reference_at: '2026-10-01T01:00:00Z' }]];
    }
    if (sql.includes('DATE_ADD(?, INTERVAL 1 DAY)') && sql.includes('FROM ledger_stock_price_snapshots')) {
      expect(params).toEqual([301, '600000.SH', pauseDate, pauseDate, 301, pauseDate, pauseDate]);
      return [unpriced ? [] : [{ symbol: '600000.SH', price: 9, price_date: pauseDate, captured_at: `${pauseDate}T07:05:00Z` }]];
    }
    if (sql.includes('DATE_ADD(?, INTERVAL 1 DAY)') && sql.includes('FROM ledger_stock_intraday_quotes')) {
      expect(params).toEqual([301, '600000.SH', pauseDate, pauseDate]);
      return [unpriced ? [] : [{ symbol: '600000.SH', price: 8, price_date: pauseDate, captured_at: `${pauseDate}T07:00:00Z` }]];
    }
    return base(sql, params);
  });
}

type MockParticipation = ReturnType<typeof realParticipation>;
function realParticipation(allocated = 100, remaining = allocated) {
  return {
    id: 901, ledger_id: 37, category_id: 301, lot_id: 101, user_id: 201,
    allocated_quantity: allocated, remaining_quantity: remaining, entry_price: 10,
    start_date: '2026-10-01', pause_date: null, assigned_at: '2026-10-01', assigned_by: 1,
    closure_count: allocated > remaining ? 1 : 0, closed_quantity: allocated - remaining,
    closed_value: (allocated - remaining) * 9, realized_pnl: allocated - remaining,
    closed_at: allocated > remaining ? '2026-11-03' : null,
    symbol: '600000.SH', stock_name: '测试股票', opened_at: '2026-10-01', initial_quantity: 100,
  };
}
function installTransactionMock({ participation = null, exists = true, failAt }: {
  participation?: MockParticipation | null; exists?: boolean; failAt?: 'release' | 'upsert' | 'commit';
} = {}) {
  const state = {
    participation: participation ? { ...participation } : null,
    observation: null as Record<string, any> | null,
    closures: participation && participation.closed_quantity > 0
      ? [{ id: 902, participation_id: participation.id, sell_event_id: 903, quantity: participation.closed_quantity, sale_price: 9 }]
      : [],
  };
  let snapshot = structuredClone(state);
  mocks.begin.mockImplementation(async () => { snapshot = structuredClone(state); });
  mocks.commit.mockImplementation(async () => {
    if (failAt === 'commit') throw new Error('commit failed');
    if (state.observation?.enabled === 1 && (state.participation?.remaining_quantity ?? 0) > 0) {
      throw new Error('真实余量与观察不能并存');
    }
  });
  mocks.rollback.mockImplementation(async () => { Object.assign(state, structuredClone(snapshot)); });
  mocks.txExecute.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('information_schema.tables')) return [exists ? [{ TABLE_NAME: 'ledger_stock_lot_observations' }] : []];
    if (sql.includes('FROM ledger_members')) return [[{ userId: 201 }]];
    if (sql.includes('FROM ledger_stock_lots')) return [[{ ...lotRow, initial_quantity: 100 }]];
    if (sql.includes('FROM ledger_stock_lot_observations')) return [state.observation ? [{ ...state.observation }] : []];
    if (sql.includes('FROM ledger_stock_event_lot_allocations')) return [[{ globally_sold_quantity: state.participation?.closed_quantity ?? 0 }]];
    if (sql.includes('SUM(remaining_quantity)')) return [[{ allocated_quantity: 0 }]];
    if (/^\s*SELECT/.test(sql) && sql.includes('FROM ledger_stock_lot_participations')) return [state.participation ? [{ ...state.participation }] : []];
    if (sql.includes('UPDATE ledger_stock_lot_participations')) {
      if (failAt === 'release') throw new Error('release failed');
      if (!state.participation) throw new Error('participation missing');
      state.participation.allocated_quantity = params[0];
      state.participation.remaining_quantity = params[1];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO ledger_stock_lot_participations')) {
      state.participation = { ...realParticipation(params[4], params[5]), user_id: params[3] };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM ledger_stock_lot_participations')) {
      state.participation = null;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO ledger_stock_lot_observations')) {
      if (failAt === 'upsert') throw new Error('upsert failed');
      state.observation = { ledger_id: params[0], category_id: params[1], lot_id: params[2], user_id: params[3],
        enabled: params[4], quantity: params[5], entry_price: params[6], start_date: params[7], pause_date: params[8], assigned_by: params[9] };
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected transaction SQL (funds/history writes forbidden): ${sql}`);
  });
  return state;
}

// 原真实分配/成员缓存入口有既有初始化流程。这里只mock接收它，不改旧行为或执行真实DDL。
function allowLegacyInitialization() {
  const base = mocks.execute.getMockImplementation()!;
  mocks.execute.mockImplementation(async (sql: string, ...args) => {
    if (sql.includes('information_schema.columns')) return [[
      { COLUMN_NAME: 'accounting_mode' }, { COLUMN_NAME: 'transaction_fee' }, { COLUMN_NAME: 'note' },
      { COLUMN_NAME: 'usd_cny_rate' }, { COLUMN_NAME: 'start_date' }, { COLUMN_NAME: 'pause_date' },
    ]];
    if (/^\s*CREATE TABLE IF NOT EXISTS/.test(sql)) return [{ affectedRows: 0 }];
    return base(sql, ...args);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-05T02:00:00Z'));
});

afterEach(() => { vi.restoreAllMocks(); });

describe('独立观察纯计算', () => {
  it('全部真实配额已分配也可观察任意股数，不修改真实100%额度、余额、钱包、快照', () => {
    const real = Object.freeze({ availableForParticipation: 0, participations: Object.freeze([{ remainingQuantity: 100 }]),
      summary: Object.freeze({ floatingPnl: 200, realizedPnl: 80 }), wallet: 100, deposit: 50, snapshots: Object.freeze([]) });
    const source = Object.freeze({ ...observation(), ...real });
    const result = buildStockObservationHolding(source, quote, today)!;
    expect(result).toMatchObject({ quantity: 1000, currentQuantity: 1000, floatingPnl: 2000, totalPnl: 2000 });
    expect(source.availableForParticipation).toBe(0);
    expect(source.participations[0].remainingQuantity).toBe(100);
    expect(source.summary).toEqual({ floatingPnl: 200, realizedPnl: 80 });
    expect(result).not.toHaveProperty('participations');
    expect(result).not.toHaveProperty('wallet');
    expect(result).not.toHaveProperty('snapshots');
    expect(summarizeStockObservationHoldings([result]).totalPnl).toBe(2000);
  });

  it('股价跌观察收益为正，涨为负，成本与市值保持原币种', () => {
    expect(holding()).toMatchObject({ costValue: 10000, marketValue: 8000, floatingPnl: 2000, closedPnl: 0, totalPnl: 2000 });
    expect(holding({}, { ...quote, price: 12 }).totalPnl).toBe(-2000);
  });

  it('USD/CNY分币汇总，不自动调用汇率或直接相加', () => {
    const summary = summarizeStockObservationHoldings([holding(), holding({ symbol: 'AAPL', lotId: 102 })]);
    expect(summary).toMatchObject({ reportingCurrency: null, isMixedCurrency: true, costValue: null, marketValue: null, floatingPnl: null, totalPnl: null });
    expect(summary.currencySummaries.map((row) => [row.currency, row.totalPnl])).toEqual([['CNY', 2000], ['USD', 2000]]);
    expect(summarizeStockObservationHoldings([holding({ symbol: 'AAPL' })])).toMatchObject({ reportingCurrency: 'USD', totalPnl: 2000 });
  });

  it('无报价null，不用入场价冒充行情也不把未知收益当零', () => {
    const row = holding({}, null);
    expect(row).toMatchObject({ marketPrice: null, marketValue: null, floatingPnl: null, totalPnl: null, marketQuoteSource: 'unavailable' });
    expect(summarizeStockObservationHoldings([holding(), row])).toMatchObject({ marketValue: null, totalPnl: null, unpricedHoldingCount: 1 });
  });

  it.each([NaN, Infinity, -Infinity, -1, 0])('无效实时价%s保持null', (price) => {
    expect(holding({}, { ...quote, price }).totalPnl).toBeNull();
  });

  it('部分平仓按批次剩余/初始比例拆分，仅已卖部分冻结；不按观察总股数全部结算', () => {
    const row = holding({ lotCurrentQuantity: 60, soldQuantity: 40, soldValue: 360 });
    expect(row).toMatchObject({ quantity: 1000, currentQuantity: 600, closedQuantity: 400,
      frozenSalePrice: 9, marketPrice: 8, floatingPnl: 1200, closedPnl: 400, totalPnl: 1600, marketValue: 8400, status: 'partial_closed' });
    expect(holding({ lotCurrentQuantity: 60, soldQuantity: 40, soldValue: 360 }, { ...quote, price: 7 })).toMatchObject({ closedPnl: 400, floatingPnl: 1800 });
  });

  it('全平仓按实际批次加权卖价冻结，任何后续实时价都不能改变totalPnl', () => {
    // 两次真实售出40股×9和60股×11，由服务聚合为soldValue。
    const source = observation({ lotCurrentQuantity: 0, soldQuantity: 100, soldValue: 40 * 9 + 60 * 11, soldAt: '2026-11-03T01:00:00Z', soldDate: '2026-11-03' });
    const frozen = buildStockObservationHolding(source, quote, today)!;
    expect(frozen).toMatchObject({ currentQuantity: 0, closedQuantity: 1000, marketPrice: 10.2, marketQuoteSource: 'sale',
      marketQuoteDate: '2026-11-03', marketQuoteUpdatedAt: source.soldAt, floatingPnl: 0, status: 'closed' });
    expect(frozen.totalPnl).toBeCloseTo(-200);
    expect(buildStockObservationHolding(source, { ...quote, price: 100 }, today)).toEqual(frozen);
    expect(buildStockObservationHolding(source, null, today)).toEqual(frozen);
  });

  it('全平仓实际卖价缺失仍冻结null，不跟实时行情', () => {
    expect(holding({ lotCurrentQuantity: 0, soldQuantity: 100 }, quote)).toMatchObject({ status: 'closed', marketPrice: null, floatingPnl: 0, closedPnl: null, totalPnl: null });
  });

  it('允许实际卖价0（冻结正收益），观察配置关闭或股数0不返回holding', () => {
    expect(holding({ lotCurrentQuantity: 0, soldQuantity: 100, soldValue: 0 })).toMatchObject({ marketPrice: 0, totalPnl: 10000 });
    expect(buildStockObservationHolding(observation({ enabled: false }), quote, today)).toBeNull();
    expect(buildStockObservationHolding(observation({ quantity: 0 }), quote, today)).toBeNull();
  });

  it('未来开始返回pending，完全不参与金额、币种或有效holdings汇总', () => {
    const pending = holding({ startDate: '2026-11-06', symbol: 'AAPL' });
    expect(pending).toMatchObject({ status: 'pending', currentQuantity: 0, floatingPnl: 0, totalPnl: 0 });
    expect(summarizeStockObservationHoldings([holding(), pending])).toMatchObject({ reportingCurrency: 'CNY', isMixedCurrency: false, holdingCount: 1, totalPnl: 2000, scheduledHoldingCount: 1 });
    expect(summarizeStockObservationHoldings([pending])).toMatchObject({ reportingCurrency: null, holdingCount: 0, totalPnl: 0, currencySummaries: [] });
    expect(holding({ startDate: today }).status).toBe('active');
  });

  it('暂停已到采用历史quote与as-of批次比例，摘要独立且不跟随后续报价', () => {
    const source = { pauseDate: '2026-11-02', lotCurrentQuantity: 60, soldQuantity: 40, soldValue: 360 };
    const historical: StockObservationQuote = { price: 7, priceDate: '2026-11-02', updatedAt: '2026-11-02T07:00:00Z', source: 'close' };
    const row = holding(source, historical);
    expect(row).toMatchObject({ status: 'paused', pauseDate: '2026-11-02', currentQuantity: 600, closedQuantity: 400,
      marketPrice: 7, marketQuoteDate: '2026-11-02', floatingPnl: 1800, closedPnl: 400, totalPnl: 2200, marketValue: 7800 });
    expect(summarizeStockObservationHoldings([row])).toMatchObject({ totalPnl: 2200, closedHoldingCount: 0, activeHoldingCount: 1 });
    expect(holding(source, quote)).toMatchObject({ status: 'paused', marketPrice: null, totalPnl: null, marketQuoteSource: 'unavailable' });
    // 美国交易日仍在暂停日，但采集在北京时间次日，也不能冒充冻结价。
    expect(holding(source, { ...historical, updatedAt: '2026-11-02T17:00:00Z' }).marketPrice).toBeNull();
  });

  it('暂停无历史报价保持待估值null，不以entry或fake0替代', () => {
    const row = holding({ pauseDate: today }, null);
    expect(row).toMatchObject({ status: 'paused', costValue: 10000, marketValue: null, floatingPnl: null, totalPnl: null });
    expect(summarizeStockObservationHoldings([row])).toMatchObject({ costValue: 10000, totalPnl: null, unpricedHoldingCount: 1 });
  });

  it('未来暂停和清空继续实时，未来开始pending优先；截止日前全平仍closed', () => {
    expect(holding({ pauseDate: '2026-11-06' })).toMatchObject({ status: 'active', marketPrice: 8, totalPnl: 2000 });
    expect(holding({ pauseDate: '' })).toMatchObject({ status: 'active', marketPrice: 8 });
    expect(holding({ pauseDate: today, startDate: '2026-11-06' })).toMatchObject({ status: 'pending', totalPnl: 0 });
    expect(holding({ pauseDate: today, lotCurrentQuantity: 0, soldQuantity: 100, soldValue: 900 })).toMatchObject({ status: 'closed', totalPnl: 1000 });
  });

  it('暂停日期严格校验并允许同开始日、空串清空', () => {
    expect(validateStockObservationPauseDate(today, today)).toBe(today);
    expect(validateStockObservationPauseDate('', today)).toBeNull();
    expect(validateStockObservationPauseDate(undefined, today)).toBeNull();
    expect(() => validateStockObservationPauseDate('2026-11-04', today)).toThrow('不能早于');
    for (const date of ['2026-02-29', '2026-13-01', '2026-11-05junk']) {
      expect(() => validateStockObservationPauseDate(date, '2026-01-01')).toThrow('观察暂停日期');
    }
  });

  it('股数0至10亿finite、价格DECIMAL范围、日历日期严格校验', () => {
    expect(validateStockObservationQuantity(0)).toBe(0);
    expect(validateStockObservationQuantity(1e9)).toBe(1e9);
    for (const quantity of [NaN, Infinity, -Infinity, -1, 1e9 + 1]) expect(() => validateStockObservationQuantity(quantity)).toThrow();
    for (const price of [NaN, Infinity, -1, 0, 1e12]) expect(() => validateStockObservationEntryPrice(price)).toThrow();
    expect(validateStockObservationStartDate('2028-02-29')).toBe('2028-02-29');
    for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-11-05junk', '', '0999-12-31']) expect(() => validateStockObservationStartDate(date)).toThrow();
  });
});

describe('真实余量转观察纯转换', () => {
  it.each([
    [100, 100, 0, 100], [100, 60, 40, 60], [40, 0, 40, 0], [0, 0, 0, 0],
    [0.3, 0.2, 0.1, 0.2], [0.00000001, 0.00000001, 0, 0.00000001],
  ])('allocated=%s remaining=%s转换且不修改输入', (allocatedQuantity, remainingQuantity, retained, releasedQuantity) => {
    const input = Object.freeze({ allocatedQuantity, remainingQuantity });
    const result = releaseStockParticipationForObservation(input);
    expect(result).toEqual({ allocatedQuantity: retained, remainingQuantity: 0, releasedQuantity });
    expect(input).toEqual({ allocatedQuantity, remainingQuantity });
    expect(releaseStockParticipationForObservation(result)).toEqual({ ...result, releasedQuantity: 0 });
  });

  it.each([[NaN, 0], [100, Infinity], [100, -1], [40, 60], [-1, 0]])('异常真实份额%s/%s拒绝转换', (allocatedQuantity, remainingQuantity) => {
    expect(() => releaseStockParticipationForObservation({ allocatedQuantity, remainingQuantity })).toThrow('真实参与股数异常');
  });
});

describe('观察接口（纯mock，无生产DB或ensure）', () => {
  it('观察表不存在本人读取holdings为空，目录categories为空，仅SELECT无DDL', async () => {
    installReadMock({ exists: false, role: 'member' });
    expect(await getMyStockTagObservationPortfolio(accessInput)).toMatchObject({ observationView: true, holdings: [], summary: { holdingCount: 0, totalPnl: 0 } });
    expect(await getMyStockTagObservationOverview(accessInput)).toEqual({ categories: [] });
    expect(mocks.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });

  it('普通成员无真实参与也可读取本人观察，报价使用同日更晚盘中价，SQL限制本人', async () => {
    installReadMock({ role: 'member' });
    const result = await getMyStockTagObservationPortfolio(accessInput);
    expect(result.holdings[0]).toMatchObject({ lotId: 101, marketPrice: 8, marketQuoteSource: 'intraday', totalPnl: 2000 });
    expect(result).not.toHaveProperty('isEligible');
    const query = mocks.execute.mock.calls.find(([sql]) => sql.includes('FROM ledger_stock_lot_observations o'))!;
    expect(query[0]).toContain('o.user_id = ? AND o.enabled = 1 AND o.quantity > 0');
    expect(query[1]).toEqual([37, 301, 37, 301, 201]);
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('ledger_stock_lot_participations'))).toBe(false);
  });

  it('盘尾捕获更晚时替代同日盘中价，复用既有行情优先级', async () => {
    installReadMock();
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql, ...args) => {
      if (sql.includes('FROM ledger_stock_price_snapshots')) return [[{ symbol: '600000.SH', price: '9', price_date: today, captured_at: `${today}T02:00:00Z` }]];
      return base(sql, ...args);
    });
    expect((await getMyStockTagObservationPortfolio(accessInput)).holdings[0]).toMatchObject({ marketPrice: 9, marketQuoteSource: 'close', totalPnl: 1000 });
  });

  it('全部平仓仅读销售聚合，不读取参考/盘中/日结行情；冻结展示', async () => {
    installReadMock({ observations: [{ ...dbObservation, sold_quantity: '100', sold_value: '900', sold_at: '2026-11-03', sold_date: '2026-11-03' }] });
    expect((await getMyStockTagObservationPortfolio(accessInput)).holdings[0]).toMatchObject({ status: 'closed', marketPrice: 9, totalPnl: 1000 });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('FROM ledger_stock_intraday_quotes') || sql.includes('FROM ledger_stock_price_snapshots'))).toBe(false);
  });

  it('观察目录独立返回可见类别，不调用真实资格', async () => {
    installReadMock({ role: 'member' });
    expect(await getMyStockTagObservationOverview(accessInput)).toEqual({ categories: [{ categoryId: 301, categoryName: '阿一', holdingCount: 1 }] });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('ledger_stock_lot_participations'))).toBe(false);
  });

  it('隐藏标签拒绝本人观察读取且目录过滤；不让观察突破可见性', async () => {
    installReadMock({ role: 'member' });
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql, ...args) => {
      if (sql.includes('initial_balances')) return [[{ role: 'member', initialBalances: JSON.stringify({ '阿一__visible': 0 }) }]];
      return base(sql, ...args);
    });
    await expect(getMyStockTagObservationPortfolio(accessInput)).rejects.toThrow('您无权查看此标签');
    expect(await getMyStockTagObservationOverview(accessInput)).toEqual({ categories: [] });
  });

  it('缺表写入拒绝且不触发DDL/事务', async () => {
    installReadMock({ exists: false });
    await expect(setStockLotObservation({ ...accessInput, lotId: 101, targetUserId: 201, enabled: true, quantity: 1000 })).rejects.toThrow('尚未初始化');
    expect(mocks.txExecute).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  it('成员不允许观察写入', async () => {
    installReadMock({ role: 'member' });
    await expect(setStockLotObservation({ ...accessInput, lotId: 101, targetUserId: 201, enabled: true, quantity: 1000 })).rejects.toThrow('仅37号账本管理员');
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });

  it('无真实参与时管理员仅UPSERT观察表，默认批次成本，可保存任意观察股数', async () => {
    installReadMock();
    installTransactionMock();
    const result = await setStockLotObservation({ ...accessInput, lotId: 101, targetUserId: 201, enabled: true, quantity: 1e9 });
    expect(result).toMatchObject({ success: true, observation: { quantity: 1e9, entryPrice: 10, startDate: '2026-10-01' } });
    const writes = mocks.txExecute.mock.calls.filter(([sql]) => !/^\s*SELECT/.test(sql));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain('ON DUPLICATE KEY UPDATE');
    expect(writes[0][0]).toContain('INSERT INTO ledger_stock_lot_observations');
    expect(writes.some(([sql]) => /participation|closure|snapshot|wallet|globally_sold_quantity/.test(sql))).toBe(false);
    const locks = mocks.txExecute.mock.calls.filter(([sql]) => sql.includes('FOR UPDATE'));
    expect(locks[1][0]).toContain('FROM ledger_stock_lots');
    expect(locks[2][0]).toContain('FROM ledger_stock_lot_participations');
    expect(locks[2][1]).toEqual([101, 201]);
    expect(locks[3][0]).toContain('FROM ledger_stock_lot_observations');
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('观察开关关闭保留自定义价/日期，不删观察或真实参与', async () => {
    installReadMock();
    const state = installTransactionMock({ participation: realParticipation(40, 0) });
    state.observation = { ledger_id: 37, category_id: 301, enabled: 1, entry_price: 12, start_date: '2026-10-02', pause_date: '2026-11-02' };
    const originalParticipation = { ...state.participation };
    expect(await setStockLotObservation({ ...accessInput, lotId: 101, targetUserId: 201, enabled: false, quantity: 1000 })).toMatchObject({ observation: { enabled: false, entryPrice: 12, startDate: '2026-10-02', pauseDate: '2026-11-02' } });
    expect(mocks.txExecute.mock.calls.some(([sql]) => sql.includes('DELETE'))).toBe(false);
    expect(state.participation).toEqual(originalParticipation);
    expect(state.observation?.enabled).toBe(0);
    expect(mocks.txExecute.mock.calls.filter(([sql]) => !/^\s*SELECT/.test(sql))).toHaveLength(1);
  });

  it.each(['nonmember', 'wronglot', 'crossledger'])('目标成员/批次归属错误%s拒绝写入并rollback', async (reason) => {
    installReadMock();
    mocks.txExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM ledger_members')) return [reason === 'nonmember' ? [] : [{ userId: 201 }]];
      if (sql.includes('FROM ledger_stock_lots')) return [reason === 'wronglot' ? [] : [lotRow]];
      if (sql.includes('FROM ledger_stock_lot_participations')) return [[]];
      if (sql.includes('SELECT ledger_id')) return [[{ ledger_id: 38, category_id: 301, entry_price: '12', start_date: '2026-10-02' }]];
      throw new Error('No writes expected');
    });
    await expect(setStockLotObservation({ ...accessInput, lotId: 101, targetUserId: 201, enabled: true, quantity: 1000 })).rejects.toThrow();
    expect(mocks.txExecute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(mocks.rollback).toHaveBeenCalledOnce();
  });

  it('矩阵读侧不凭观察字段重算真实份额，缺表保持既有公式（历史fixture）', async () => {
    installReadMock();
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql, ...args) => {
      if (sql.includes('FROM ledger_stock_lots l') && sql.includes('globally_sold_quantity')) return [[{
        id: 101, symbol: '600000.SH', stock_name: '测试股票', opened_at: '2026-10-01', initial_quantity: '100', unit_cost: '10',
        globally_sold_quantity: '0', observation_sold_quantity: '0', observation_sold_value: '0', observation_sold_at: null,
      }]];
      if (sql.includes('SELECT lm.userId')) return [[{ userId: 201, role: 'admin', name: '管理员' }]];
      if (sql.includes('FROM ledger_stock_lot_participations p')) return [[{
        id: 1, lot_id: 101, user_id: 201, allocated_quantity: '100', remaining_quantity: '100', closed_quantity: '0',
        entry_price: '10', start_date: '2026-10-01', pause_date: null, assigned_at: '2026-10-01', assigned_by: 1, realized_pnl: '0',
      }]];
      return base(sql, ...args);
    });
    const withObservation = await getStockLotParticipationMatrix(accessInput);
    expect(withObservation.lots[0]).toMatchObject({ availableForParticipation: 0,
      participations: [{ allocatedQuantity: 100, remainingQuantity: 100, floatingPnl: 200, totalPnl: 200 }],
      observations: [{ quantity: 1000, currentQuantity: 1000, floatingPnl: 2000, totalPnl: 2000 }],
    });
    const impl = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql, ...args) => sql.includes('information_schema.tables') ? [[]] : impl(sql, ...args));
    const withoutObservation = await getStockLotParticipationMatrix(accessInput);
    expect(withoutObservation.lots[0].observations).toEqual([]);
    const { observations: _first, ...first } = withObservation.lots[0];
    const { observations: _second, ...second } = withoutObservation.lots[0];
    expect(first).toEqual(second);
    expect(mocks.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });
});

describe('观察暂停截至日期（纯mock，仅SELECT/独立观察UPSERT）', () => {
  const input = { ...accessInput, lotId: 101, targetUserId: 201, enabled: true, quantity: 1000 };

  it('只读沙箱helper无需观察表试验行，原批次initial与截止前已卖数量分开', async () => {
    installPauseReadMock({ exists: false });
    const result = await getStockObservationPauseContext(101, pauseDate);
    expect(result).toMatchObject({ pauseDate, observationValuation: {
      initialQuantity: 100, lotCurrentQuantity: 60, soldQuantity: 40, soldValue: 360, soldDate: '2026-11-01',
    }, quote: { price: 9, priceDate: pauseDate, source: 'close' } });
    expect(mocks.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(mocks.execute.mock.calls.some(([sql]) => /ledger_stock_lot_observations|participations|closures|wallet|balance/.test(sql))).toBe(false);
    const salesSql = mocks.execute.mock.calls[0][0];
    expect(salesSql).toContain('a.lot_id = l.id');
    expect(salesSql).toContain("e.status = 'active' AND e.event_type IN ('reduce','sell')");
    expect(salesSql).toContain('COALESCE(e.actual_traded_at, e.server_registered_at) < DATE_ADD(?, INTERVAL 1 DAY)');
  });

  it('全部真实卖在pause之后，观察不得被未来销售算成closed', async () => {
    installPauseReadMock({ soldQuantity: 0, soldValue: 0 });
    const result = await getMyStockTagObservationPortfolio(accessInput);
    expect(result.holdings[0]).toMatchObject({ pauseDate, status: 'paused', currentQuantity: 1000, closedQuantity: 0,
      marketPrice: 9, floatingPnl: 1000, closedPnl: 0, totalPnl: 1000 });
    expect(result.summary).toMatchObject({ costValue: 10000, marketValue: 9000, totalPnl: 1000, closedHoldingCount: 0 });
    expect(mocks.execute.mock.calls.filter(([sql]) => /FROM ledger_stock_(intraday_quotes|price_snapshots)/.test(sql))
      .every(([sql]) => sql.includes('DATE_ADD'))).toBe(true);
  });

  it('部分在pause前售出只冻结对应比例，pause后全卖不影响本股观察', async () => {
    installPauseReadMock();
    expect((await getMyStockTagObservationPortfolio(accessInput)).holdings[0]).toMatchObject({ status: 'paused',
      currentQuantity: 600, closedQuantity: 400, marketPrice: 9, floatingPnl: 600, closedPnl: 400, totalPnl: 1000 });
  });

  it('pause前全卖继续按sale冻结，不读取任何报价', async () => {
    installPauseReadMock({ soldQuantity: 100, soldValue: 900 });
    expect((await getMyStockTagObservationPortfolio(accessInput)).holdings[0]).toMatchObject({ status: 'closed', marketQuoteSource: 'sale', totalPnl: 1000 });
    expect(mocks.execute.mock.calls.some(([sql]) => /FROM ledger_stock_(intraday_quotes|price_snapshots)/.test(sql))).toBe(false);
  });

  it('没有截止前报价显示待估值而非fake0，不读取暂停后的实时行情', async () => {
    installPauseReadMock({ unpriced: true });
    const result = await getMyStockTagObservationPortfolio(accessInput);
    expect(result.holdings[0]).toMatchObject({ status: 'paused', marketPrice: null, marketValue: null, totalPnl: null, closedPnl: 400 });
    expect(result.summary).toMatchObject({ totalPnl: null, unpricedHoldingCount: 1 });
    expect(mocks.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  it.each(['2026-11-06', null])('未来/清空pause=%s继续实时、不调用历史helper', async (date) => {
    installReadMock({ observations: [{ ...dbObservation, pause_date: date }] });
    expect((await getMyStockTagObservationPortfolio(accessInput)).holdings[0]).toMatchObject({ pauseDate: date, status: 'active', marketPrice: 8 });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('DATE_ADD'))).toBe(false);
  });

  it('matrix保留默认全量observationValuation，新增暂停as-of上下文且不改变真实份额估值', async () => {
    installPauseReadMock();
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM ledger_stock_lots l') && sql.includes('globally_sold_quantity')) return [[{
        ...lotRow, symbol: '600000.SH', stock_name: '测试股票', initial_quantity: 100, globally_sold_quantity: 100,
        observation_sold_quantity: 100, observation_sold_value: 1100, observation_sold_at: '2026-11-04',
      }]];
      if (sql.includes('SELECT lm.userId')) return [[{ userId: 201, role: 'admin', name: '管理员' }]];
      if (sql.includes('FROM ledger_stock_lot_participations p')) return [[realParticipation(40, 0)]];
      return base(sql, params);
    });
    const lot = (await getStockLotParticipationMatrix(accessInput)).lots[0];
    expect(lot).toMatchObject({ currentQuantity: 0, marketPrice: 8, availableForParticipation: 0,
      observationValuation: { initialQuantity: 100, soldQuantity: 100, lotCurrentQuantity: 0 },
      observations: [{ pauseDate, status: 'paused', currentQuantity: 600, closedQuantity: 400, totalPnl: 1000 }],
      participations: [{ id: 901, remainingQuantity: 0, pauseDate: '', totalPnl: 40 }],
    });
    expect(lot.pausedValuationByDate[pauseDate]).toMatchObject({ observationValuation: { initialQuantity: 100, soldQuantity: 40, lotCurrentQuantity: 60 }, quote: { price: 9 } });
    expect(mocks.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  it('pause写入仅观察UPSERT；省略保留、关闭保留、空串清空，不改real.pause_date', async () => {
    installReadMock();
    const real = realParticipation(40, 0);
    real.pause_date = '2026-10-15' as any;
    const state = installTransactionMock({ participation: real });
    expect(await setStockLotObservation({ ...input, pauseDate })).toMatchObject({ observation: { pauseDate } });
    expect(state.observation?.pause_date).toBe(pauseDate);
    expect(await setStockLotObservation({ ...input, enabled: false })).toMatchObject({ observation: { pauseDate } });
    expect(state.observation?.pause_date).toBe(pauseDate);
    expect(await setStockLotObservation({ ...input, pauseDate: '' })).toMatchObject({ observation: { pauseDate: null } });
    expect(state.observation?.pause_date).toBeNull();
    expect(state.participation).toEqual(real);
    expect(mocks.txExecute.mock.calls.filter(([sql]) => !/^\s*SELECT/.test(sql))
      .every(([sql]) => sql.includes('INSERT INTO ledger_stock_lot_observations'))).toBe(true);
  });

  it.each([{ pauseDate: '2026-09-30' }, { pauseDate: '2026-02-30' }, { startDate: '2026-11-03' }])('日期无效%s在释放前rollback，不动real余量', async (dates) => {
    installReadMock();
    const state = installTransactionMock({ participation: realParticipation() });
    state.observation = { ledger_id: 37, category_id: 301, entry_price: 10, start_date: '2026-10-01', pause_date: pauseDate };
    const original = structuredClone(state);
    await expect(setStockLotObservation({ ...input, ...dates })).rejects.toThrow('观察暂停日期');
    expect(state).toEqual(original);
    expect(mocks.txExecute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(mocks.rollback).toHaveBeenCalledOnce();
  });
});


describe('观察与真实份额互斥事务（严格mock）', () => {
  const observationInput = { ...accessInput, lotId: 101, targetUserId: 201, enabled: true, quantity: 1000 };
  const participationInput = { ...accessInput, lotId: 101, targetUserId: 201, quantity: 100 };
  const writes = () => mocks.txExecute.mock.calls.filter(([sql]) => !/^\s*SELECT/.test(sql));
  const assertOnlyObservationReleaseWrites = () => {
    expect(mocks.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(writes().every(([sql]) => /^\s*(UPDATE ledger_stock_lot_participations|INSERT INTO ledger_stock_lot_observations)\b/.test(sql))).toBe(true);
    expect(writes().some(([sql]) => /closure|sell_event|sale_profit|snapshot|balance|wallet|deposit|recharge|freeze|ledger_stock_events|ledger_stock_event_lot_allocations/.test(sql))).toBe(false);
  };

  it('100%实配仍可转任意观察股数，真实余量和allocated归零但历史ID保留', async () => {
    installReadMock();
    const state = installTransactionMock({ participation: realParticipation() });
    await setStockLotObservation({ ...observationInput, quantity: 1e9 });
    expect(state.participation).toMatchObject({ id: 901, allocated_quantity: 0, remaining_quantity: 0, entry_price: 10, assigned_by: 1 });
    expect(state.observation).toMatchObject({ enabled: 1, quantity: 1e9 });
    expect(writes()).toHaveLength(2);
    expect(writes()[0][1]).toEqual([0, 0, 901, 37, 301, 101, 201]);
    expect(writes()[1][0]).toContain('ON DUPLICATE KEY UPDATE');
    expect(mocks.txExecute.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.commit.mock.invocationCallOrder[0]);
    expect(mocks.commit).toHaveBeenCalledOnce();
    assertOnlyObservationReleaseWrites();
  });

  it('allocated100 remaining60只释放60保留已售40、原ID和全部closure，矩阵可分配自然增加', async () => {
    installReadMock();
    const state = installTransactionMock({ participation: realParticipation(100, 60) });
    const historicalClosures = structuredClone(state.closures);
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql: string, ...args) => {
      if (sql.includes('FROM ledger_stock_lots l') && sql.includes('globally_sold_quantity')) return [[{
        ...lotRow, symbol: '600000.SH', stock_name: '测试股票', initial_quantity: 100, globally_sold_quantity: 40,
        observation_sold_quantity: 40, observation_sold_value: 360, observation_sold_at: '2026-11-03',
      }]];
      if (sql.includes('SELECT lm.userId')) return [[{ userId: 201, role: 'admin', name: '管理员' }]];
      if (sql.includes('FROM ledger_stock_lot_participations p')) return [[{ ...state.participation }]];
      if (sql.includes('FROM ledger_stock_lot_observations o') && !sql.includes('COUNT')) return [state.observation
        ? [{ ...dbObservation, ...state.observation, sold_quantity: 40, sold_value: 360 }] : []];
      return base(sql, ...args);
    });
    const before = await getStockLotParticipationMatrix(accessInput);
    expect(before.lots[0]).toMatchObject({ availableForParticipation: 0,
      participations: [{ remainingQuantity: 60, floatingPnl: 120, realizedPnl: 40, totalPnl: 160 }] });
    await setStockLotObservation(observationInput);
    expect(state.participation).toMatchObject({ id: 901, allocated_quantity: 40, remaining_quantity: 0, closed_quantity: 40, realized_pnl: 40 });
    expect(state.closures).toEqual(historicalClosures);
    const after = await getStockLotParticipationMatrix(accessInput);
    expect(after.lots[0]).toMatchObject({ availableForParticipation: 60,
      participations: [{ id: 901, allocatedQuantity: 40, remainingQuantity: 0, closedQuantity: 40, floatingPnl: 0, realizedPnl: 40, totalPnl: 40 }],
      observations: [{ quantity: 1000, currentQuantity: 600, floatingPnl: 1200, closedPnl: 400, totalPnl: 1600 }] });
    assertOnlyObservationReleaseWrites();
  });

  it.each([100, 0.00000001])('零观察股数enabled仍释放%s真实余量，未来观察开始日期也不延迟释放', async (quantity) => {
    installReadMock();
    const state = installTransactionMock({ participation: realParticipation(quantity) });
    await setStockLotObservation({ ...observationInput, quantity: 0, startDate: '2099-01-01' });
    expect(state.participation).toMatchObject({ id: 901, allocated_quantity: 0, remaining_quantity: 0 });
    expect(state.observation).toMatchObject({ enabled: 1, quantity: 0, start_date: '2099-01-01' });
    assertOnlyObservationReleaseWrites();
  });

  it.each([[100, 100], [100, 60], [100, 0], [0, 0]])('重复启用allocated%s remaining%s幂等，不重复释放或生成历史', async (allocated, remaining) => {
    installReadMock();
    const state = installTransactionMock({ participation: realParticipation(allocated, remaining) });
    const closures = structuredClone(state.closures);
    await setStockLotObservation(observationInput);
    const released = structuredClone(state.participation);
    await setStockLotObservation({ ...observationInput, quantity: 2000 });
    expect(state.participation).toEqual(released);
    expect(state.closures).toEqual(closures);
    expect(state.observation?.quantity).toBe(2000);
    expect(writes().filter(([sql]) => sql.includes('UPDATE ledger_stock_lot_participations'))).toHaveLength(remaining > 0 ? 1 : 0);
    expect(mocks.commit).toHaveBeenCalledTimes(2);
    assertOnlyObservationReleaseWrites();
  });

  it.each(['release', 'upsert', 'commit'] as const)('%s失败rollback，释放与观察不能半提交，不写资金/收益表', async (failAt) => {
    installReadMock();
    const state = installTransactionMock({ participation: realParticipation(100, 60), failAt });
    const original = structuredClone(state);
    await expect(setStockLotObservation(observationInput)).rejects.toThrow(`${failAt} failed`);
    expect(state).toEqual(original);
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
    if (failAt !== 'commit') expect(mocks.commit).not.toHaveBeenCalled();
    assertOnlyObservationReleaseWrites();
  });

  it('真实行跨账本拒绝且rollback，不释放也不写观察', async () => {
    installReadMock();
    const p = realParticipation();
    p.ledger_id = 38;
    installTransactionMock({ participation: p });
    await expect(setStockLotObservation(observationInput)).rejects.toThrow('真实参与记录归属不一致');
    expect(writes()).toEqual([]);
    expect(mocks.rollback).toHaveBeenCalledOnce();
  });

  it.each([1000, 0])('enabled观察股数%s均禁止分配>0，在同lot锁内校验且明确要求先关闭', async (quantity) => {
    installReadMock();
    allowLegacyInitialization();
    const state = installTransactionMock();
    state.observation = { enabled: 1, quantity };
    await expect(setStockLotParticipation(participationInput)).rejects.toThrow('请先关闭观察后再分配真实股数');
    expect(writes()).toEqual([]);
    const lotLockIndex = mocks.txExecute.mock.calls.findIndex(([sql]) => sql.includes('FROM ledger_stock_lots') && sql.includes('FOR UPDATE'));
    const observationLockIndex = mocks.txExecute.mock.calls.findIndex(([sql]) => sql.includes('FROM ledger_stock_lot_observations') && sql.includes('FOR UPDATE'));
    expect(lotLockIndex).toBeGreaterThan(-1);
    expect(observationLockIndex).toBeGreaterThan(lotLockIndex);
    expect(mocks.txExecute.mock.calls[observationLockIndex][1]).toEqual([37, 301, 101, 201]);
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('关闭观察不恢复真实份额，未结算记录由管理员随后重新分配并保留ID', async () => {
    installReadMock();
    allowLegacyInitialization();
    const state = installTransactionMock({ participation: realParticipation() });
    await setStockLotObservation(observationInput);
    await setStockLotObservation({ ...observationInput, enabled: false });
    expect(state.participation).toMatchObject({ id: 901, allocated_quantity: 0, remaining_quantity: 0 });
    await setStockLotParticipation(participationInput);
    expect(state.observation?.enabled).toBe(0);
    expect(state.participation).toMatchObject({ id: 901, allocated_quantity: 100, remaining_quantity: 100 });
    expect(mocks.commit).toHaveBeenCalledTimes(3);
  });

  it('quantity0沿用既有分配规范，不被enabled观察额外拦截', async () => {
    installReadMock();
    allowLegacyInitialization();
    const state = installTransactionMock({ participation: realParticipation(0) });
    state.observation = { enabled: 1, quantity: 0 };
    await setStockLotParticipation({ ...participationInput, quantity: 0 });
    expect(state.participation).toBeNull();
    expect(state.observation?.enabled).toBe(1);
    expect(mocks.txExecute.mock.calls.some(([sql]) => sql.includes('FROM ledger_stock_lot_observations'))).toBe(false);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it('观察表不存在时真实分配维持旧行为，不查缺表、不新增DDL', async () => {
    installReadMock({ exists: false });
    allowLegacyInitialization();
    const state = installTransactionMock({ exists: false });
    await setStockLotParticipation(participationInput);
    expect(state.participation).toMatchObject({ allocated_quantity: 100, remaining_quantity: 100 });
    expect(mocks.txExecute.mock.calls.some(([sql]) => sql.includes('FROM ledger_stock_lot_observations'))).toBe(false);
    expect(mocks.txExecute.mock.calls.some(([sql]) => /CREATE|ALTER/.test(sql))).toBe(false);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it('开启和关闭成功提交均清空真实组合和首页缓存，释放后真实浮盈0且历史收益40不倒冲', async () => {
    installReadMock();
    allowLegacyInitialization();
    const state = installTransactionMock({ participation: realParticipation(100, 60) });
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql: string, ...args) => {
      if (sql.includes('SELECT DISTINCT c.id')) return [[{ id: 301, name: '阿一' }]];
      if (sql.includes('FROM ledger_stock_lot_participations p')) return [state.participation && state.participation.allocated_quantity > 0 ? [{ ...state.participation }] : []];
      return base(sql, ...args);
    });
    const readCount = () => mocks.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_stock_lot_participations p')).length;
    const overviewCount = () => mocks.execute.mock.calls.filter(([sql]) => sql.includes('SELECT DISTINCT c.id')).length;
    const before = await getMyStockTagParticipantPortfolio(accessInput);
    const overviewBefore = await getMyStockTagOverview(accessInput);
    const initialReadCount = readCount();
    expect(before.summary).toMatchObject({ floatingPnl: 120, realizedPnl: 40, totalPnl: 160 });
    expect(overviewBefore[0].summary.totalPnl).toBe(160);
    await getMyStockTagParticipantPortfolio(accessInput);
    await getMyStockTagOverview(accessInput);
    expect(readCount()).toBe(initialReadCount);
    expect(overviewCount()).toBe(1);
    await setStockLotObservation(observationInput);
    const after = await getMyStockTagParticipantPortfolio(accessInput);
    const overviewAfter = await getMyStockTagOverview(accessInput);
    expect(after.positions).toEqual([]);
    expect(after.summary).toMatchObject({ floatingPnl: 0, realizedPnl: 40, totalPnl: 40 });
    expect(after.closedLots[0]).toMatchObject({ participationId: 901, soldQuantity: 40, realizedPnl: 40 });
    expect(overviewAfter[0].summary.totalPnl).toBe(40);
    expect(readCount()).toBe(initialReadCount + 1);
    expect(overviewCount()).toBe(2);
    await setStockLotObservation({ ...observationInput, enabled: false });
    expect((await getMyStockTagParticipantPortfolio(accessInput)).summary.totalPnl).toBe(40);
    await getMyStockTagOverview(accessInput);
    expect(readCount()).toBe(initialReadCount + 2);
    expect(overviewCount()).toBe(3);
    expect(state.participation).toMatchObject({ allocated_quantity: 40, remaining_quantity: 0 });
    expect(writes().some(([sql]) => /closure|sale_profit|balance|wallet|deposit|recharge|freeze/.test(sql))).toBe(false);
  });
});


function installSaleTransactionMock({ observerEnabled = true, observationExists = true, existingObserver = true,
  observerRemaining = 0 }: { observerEnabled?: boolean; observationExists?: boolean; existingObserver?: boolean; observerRemaining?: number } = {}) {
  installReadMock();
  allowLegacyInitialization();
  const base = mocks.execute.getMockImplementation()!;
  const lot = { ...lotRow, ledger_id: 37, category_id: 301, symbol: '600000.SH', stock_name: '测试股票',
    initial_quantity: 100, opened_event_id: 801, allocated_quantity: 0, opening_fee: 1 };
  mocks.execute.mockImplementation(async (sql: string, ...args) => {
    if (sql.includes('FROM ledger_stock_lots l')) return [[lot]];
    return base(sql, ...args);
  });
  vi.mocked(searchManualStocks).mockResolvedValue([{ symbol: '600000.SH', name: '测试股票', latestPrice: 8,
    latestPriceUpdatedAt: `${today}T01:00:00Z` }] as any);
  const state = {
    eventSaved: false,
    participations: [
      ...(existingObserver ? [{ ...realParticipation(0, observerRemaining), user_id: 201 }] : []),
      { ...realParticipation(100), id: 911, user_id: 202 },
    ],
    closures: [] as Array<{ participation_id: number; sell_event_id: number; quantity: number; sale_price: number }>,
    profits: [] as any[][],
    allocations: [] as any[][],
  };
  let snapshot = structuredClone(state);
  mocks.begin.mockImplementation(async () => { snapshot = structuredClone(state); });
  mocks.rollback.mockImplementation(async () => { Object.assign(state, structuredClone(snapshot)); });
  mocks.txExecute.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('information_schema.tables')) return [observationExists ? [{ TABLE_NAME: 'ledger_stock_lot_observations' }] : []];
    if (sql.includes('INSERT INTO ledger_stock_events')) { state.eventSaved = true; return [{ insertId: 903 }]; }
    if (sql.includes('FROM ledger_stock_lots l')) return [[lot]];
    if (sql.includes('SELECT user_id FROM ledger_stock_lot_observations')) return [observerEnabled ? [{ user_id: 201, enabled: 1 }] : []];
    if (sql.includes('FROM ledger_members')) return [params.slice(1).map((userId) => ({ userId }))];
    if (sql.includes('SELECT id, remaining_quantity FROM ledger_stock_lot_participations')) {
      return [state.participations.filter((p) => p.remaining_quantity > 0
        && !(observationExists && observerEnabled && sql.includes('NOT EXISTS') && p.user_id === 201))];
    }
    if (sql.includes('FROM ledger_stock_lot_participations')) return [state.participations.map((p) => ({ ...p }))];
    if (sql.includes('closure_count')) return [[]];
    if (sql.includes('FROM ledger_stock_event_lot_allocations')) return [[{ allocated_quantity: 0 }]];
    if (sql.includes('INSERT INTO ledger_stock_event_lot_allocations')) { state.allocations.push(params); return [{ affectedRows: 1 }]; }
    if (sql.includes('INSERT INTO ledger_stock_participation_closures')) {
      state.closures.push({ participation_id: params[0], sell_event_id: params[1], quantity: params[2], sale_price: params[3] });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM ledger_stock_participation_closures c')) return [state.closures.map((c) => ({
      participation_id: c.participation_id, closed_quantity: c.quantity,
      user_id: state.participations.find((p) => p.id === c.participation_id)!.user_id, member_name: '实际成员',
    }))];
    if (sql.includes('UPDATE ledger_stock_lot_participations')) {
      const p = state.participations.find((p) => p.id === params.at(-1))!;
      if (sql.includes('remaining_quantity - ?')) p.remaining_quantity -= params[0];
      else { p.allocated_quantity = params[0]; p.remaining_quantity = params[1]; }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO ledger_stock_lot_participations')) {
      state.participations.push({ ...realParticipation(params[4], params[5]), id: 921, user_id: params[3] });
      return [{ insertId: 921 }];
    }
    if (sql.includes('DELETE FROM ledger_stock_lot_participations')) {
      state.participations = state.participations.filter((p) => p.id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO ledger_stock_sale_profit_allocations')) { state.profits.push(params); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected sale SQL: ${sql}`);
  });
  return state;
}

const saleInput = { ...accessInput, eventType: 'sell' as const, lotId: 101, executionPrice: 9, actualTradedAt: `${today}T01:00:00Z` };

describe('卖出确认观察隔离（严格事务mock）', () => {
  it.each([true, false])('enabled观察非零比例拒绝UPDATE/INSERT（existing=%s），事件与结算整体rollback', async (existingObserver) => {
    const state = installSaleTransactionMock({ existingObserver });
    const original = structuredClone(state);
    await expect(createStockTagEvent({ ...saleInput, profitAllocations: [{ userId: 201, percentage: 10 }, { userId: 202, percentage: 90 }] }))
      .rejects.toThrow('请先关闭观察后再分配真实股数');
    expect(state).toEqual(original);
    expect(mocks.txExecute.mock.calls.some(([sql]) => /^(?:\s*)(?:UPDATE|INSERT INTO) ledger_stock_(lot_participations|participation_closures|sale_profit_allocations)/.test(sql))).toBe(false);
    const lotLock = mocks.txExecute.mock.calls.findIndex(([sql]) => sql.includes('FROM ledger_stock_lots') && sql.includes('FOR UPDATE'));
    const obsLock = mocks.txExecute.mock.calls.findIndex(([sql]) => sql.includes('FROM ledger_stock_lot_observations'));
    expect(obsLock).toBeGreaterThan(lotLock);
    expect(mocks.txExecute.mock.calls[obsLock][1]).toEqual([37, 301, 101]);
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('极小但非零的观察比例也不能靠舍入成0绕过拒绝', async () => {
    installSaleTransactionMock();
    await expect(createStockTagEvent({ ...saleInput, profitAllocations: [{ userId: 201, percentage: 1e-12 }, { userId: 202, percentage: 99 }] }))
      .rejects.toThrow('请先关闭观察');
  });

  it.each(['zero', 'omitted', 'noAllocations'] as const)('%s观察用户绝不自动分配或生成自己的closure/profit，其他成员按旧行为结算', async (mode) => {
    const state = installSaleTransactionMock();
    const originalObserver = structuredClone(state.participations[0]);
    const profitAllocations = mode === 'zero' ? [{ userId: 201, percentage: 0 }, { userId: 202, percentage: 100 }]
      : mode === 'omitted' ? [{ userId: 202, percentage: 100 }] : undefined;
    expect(await createStockTagEvent({ ...saleInput, profitAllocations })).toEqual({ id: 903 });
    expect(state.participations[0]).toEqual(originalObserver);
    expect(state.closures.map((c) => [c.participation_id, c.quantity])).toEqual([[911, 100]]);
    expect(state.profits.map((p) => p[3])).toEqual([202]);
    expect(state.profits[0][6]).toBe(100);
    expect(state.allocations).toEqual([[903, 101, 100]]);
    const fifo = mocks.txExecute.mock.calls.find(([sql]) => sql.includes('SELECT id, remaining_quantity'))![0];
    expect(fifo).toContain('NOT EXISTS');
    expect(fifo).toContain('o.enabled = 1');
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it.each([{ observerEnabled: false }, { observationExists: false }])('关闭观察或缺观察表维持真实成员旧分配%s', async (options) => {
    const state = installSaleTransactionMock(options);
    await createStockTagEvent({ ...saleInput, profitAllocations: [{ userId: 201, percentage: 25 }, { userId: 202, percentage: 75 }] });
    expect(state.closures.map((c) => [c.participation_id, c.quantity])).toEqual([[901, 25], [911, 75]]);
    expect(state.profits.map((p) => [p[3], p[6]])).toEqual([[201, 25], [202, 75]]);
  });
});

function installVoidTransactionMock({ observationExists = true, observerEnabled = true, failAt,
  observerAllocated = 40, observerClosure = 30 }: { observationExists?: boolean; observerEnabled?: boolean;
  failAt?: 'closureDelete' | 'eventUpdate' | 'commit'; observerAllocated?: number; observerClosure?: number } = {}) {
  installReadMock();
  allowLegacyInitialization();
  const state = {
    eventStatus: 'active',
    participations: [{ ...realParticipation(observerAllocated, 0) }, { ...realParticipation(100, 60), id: 911, user_id: 202 }],
    closures: [{ participation_id: 901, sell_event_id: 903, quantity: observerClosure, sale_price: 9 },
      ...(observerAllocated > observerClosure ? [{ participation_id: 901, sell_event_id: 904, quantity: observerAllocated - observerClosure, sale_price: 9 }] : []),
      { participation_id: 911, sell_event_id: 903, quantity: 40, sale_price: 9 }],
  };
  let snapshot = structuredClone(state);
  mocks.begin.mockImplementation(async () => { snapshot = structuredClone(state); });
  mocks.rollback.mockImplementation(async () => { Object.assign(state, structuredClone(snapshot)); });
  mocks.commit.mockImplementation(async () => { if (failAt === 'commit') throw new Error('commit failed'); });
  mocks.txExecute.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('information_schema.tables')) return [observationExists ? [{ TABLE_NAME: 'ledger_stock_lot_observations' }] : []];
    if (sql.includes('FROM ledger_stock_events')) return [[{ id: 903, event_type: 'sell', status: state.eventStatus }]];
    if (sql.includes('FROM ledger_stock_participation_closures c')) return [state.closures.filter((c) => c.sell_event_id === params[0])
      .map((c) => ({ participation_id: c.participation_id, lot_id: 101, quantity: c.quantity }))];
    if (sql.includes('FROM ledger_stock_lots')) return [[lotRow]];
    if (sql.includes('FROM ledger_stock_lot_participations')) return [state.participations.filter((p) => p.id === params[0]).map((p) => ({ ...p }))];
    if (sql.includes('FROM ledger_stock_lot_observations')) return [observerEnabled && params[3] === 201 ? [{ enabled: 1 }] : []];
    if (sql.includes('UPDATE ledger_stock_lot_participations')) {
      const p = state.participations.find((p) => p.id === params[1])!;
      if (sql.includes('allocated_quantity - ?')) { p.allocated_quantity = Math.max(0, p.allocated_quantity - params[0]); p.remaining_quantity = 0; }
      else p.remaining_quantity += params[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM ledger_stock_participation_closures')) {
      if (failAt === 'closureDelete') throw new Error('closureDelete failed');
      state.closures = state.closures.filter((c) => c.sell_event_id !== params[0]);
      return [{ affectedRows: 2 }];
    }
    if (sql.includes('UPDATE ledger_stock_events')) {
      if (failAt === 'eventUpdate') throw new Error('eventUpdate failed');
      state.eventStatus = 'voided'; return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected void SQL: ${sql}`);
  });
  return state;
}

const voidInput = { ...accessInput, eventId: 903, reason: '测试撤销' };

describe('作废卖出不恢复观察真实资产（严格事务mock）', () => {
  it.each([[40, 30, 10], [40, 40, 0], [0.3, 0.2, 0.1]])('allocated%s撤销closure%s只保留其他已售%s，observer.remaining始终0', async (allocated, quantity, retained) => {
    const state = installVoidTransactionMock({ observerAllocated: allocated, observerClosure: quantity });
    await voidStockTagEvent(voidInput);
    expect(state.participations[0].allocated_quantity).toBeCloseTo(retained, 8);
    expect(state.participations[0].remaining_quantity).toBe(0);
    expect(state.participations[1]).toMatchObject({ allocated_quantity: 100, remaining_quantity: 100 });
    expect(state.closures.every((c) => c.sell_event_id === 904)).toBe(true);
    expect(state.eventStatus).toBe('voided');
    expect(mocks.execute.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
    expect(mocks.txExecute.mock.calls.some(([sql]) => /wallet|balance|freeze|recharge|sale_profit|snapshots/.test(sql))).toBe(false);
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it.each([{ observerEnabled: false }, { observationExists: false }])('关闭观察或缺表%s仍恢复普通用户余量，allocated不变', async (options) => {
    const state = installVoidTransactionMock(options);
    await voidStockTagEvent(voidInput);
    expect(state.participations[0]).toMatchObject({ allocated_quantity: 40, remaining_quantity: 30 });
    expect(state.participations[1]).toMatchObject({ allocated_quantity: 100, remaining_quantity: 100 });
  });

  it.each(['closureDelete', 'eventUpdate', 'commit'] as const)('%s失败原子rollback，不残留恢复量或少closure', async (failAt) => {
    const state = installVoidTransactionMock({ failAt });
    const original = structuredClone(state);
    await expect(voidStockTagEvent(voidInput)).rejects.toThrow(`${failAt} failed`);
    expect(state).toEqual(original);
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('仅commit成功后同时失效个人组合与首页缓存，撤销观察已售收益但不恢复浮盈', async () => {
    const state = installVoidTransactionMock();
    // 真实组合按当前closure聚合，仅模拟读取，不动观察配置。
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql: string, ...args) => {
      if (sql.includes('SELECT DISTINCT c.id')) return [[{ id: 301, name: '阿一' }]];
      if (sql.includes('FROM ledger_stock_lot_participations p')) {
        const p = state.participations[0];
        const closed = state.closures.filter((c) => c.participation_id === p.id);
        return [[{ ...p, closed_quantity: closed.reduce((sum, c) => sum + c.quantity, 0),
          closed_value: closed.reduce((sum, c) => sum + c.quantity * c.sale_price, 0),
          realized_pnl: closed.reduce((sum, c) => sum + c.quantity, 0) }]];
      }
      return base(sql, ...args);
    });
    // 使用新user缓存key，避免此前fixture缓存。
    const cacheInput = { ...accessInput, userId: 999 };
    const before = await getMyStockTagParticipantPortfolio(cacheInput);
    const overviewBefore = await getMyStockTagOverview(cacheInput);
    expect(before.summary.totalPnl).toBe(40);
    expect(overviewBefore[0].summary.totalPnl).toBe(40);
    const count = () => mocks.execute.mock.calls.filter(([sql]) => sql.includes('FROM ledger_stock_lot_participations p')).length;
    const baseline = count();
    await getMyStockTagParticipantPortfolio(cacheInput);
    await getMyStockTagOverview(cacheInput);
    expect(count()).toBe(baseline);
    await voidStockTagEvent(voidInput);
    expect((await getMyStockTagParticipantPortfolio(cacheInput)).summary).toMatchObject({ floatingPnl: 0, realizedPnl: 10, totalPnl: 10 });
    expect((await getMyStockTagOverview(cacheInput))[0].summary.totalPnl).toBe(10);
    expect(count()).toBe(baseline + 1);
    expect(state.participations[0]).toMatchObject({ remaining_quantity: 0, allocated_quantity: 10 });
  });
});


function installArchiveRefreshMock() {
  installPauseReadMock({ soldQuantity: 0, soldValue: 0 });
  allowLegacyInitialization();
  const base = mocks.execute.getMockImplementation()!;
  const state = { archive: [] as Array<Record<string, any>>, latestClose: null as Record<string, any> | null,
    latestIntraday: null as Record<string, any> | null, dailyWrites: 0 };
  const lot = { ...lotRow, ledger_id: 37, category_id: 301, symbol: 'AAPL', stock_name: '测试美股', initial_quantity: 100,
    opened_event_id: 801, allocated_quantity: 0, opening_fee: 1 };
  mocks.execute.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('information_schema.tables') && sql.includes("'ledger_stock_quote_history'")) return [[{ TABLE_NAME: 'ledger_stock_quote_history' }]];
    if (sql.includes('FROM ledger_stock_lots l') && sql.includes('DATE_ADD(?, INTERVAL 1 DAY)')) {
      return [[{ ...lot, sold_quantity: 0, sold_value: 0, sold_at: null }]];
    }
    if (sql.includes('FROM ledger_stock_lots l')) return [[lot]];
    if (sql.includes('SELECT id FROM ledger_categories')) return [[{ id: 301 }]];
    if (sql.includes('INSERT INTO ledger_stock_quote_history')) {
      expect(sql).not.toMatch(/ON DUPLICATE|REPLACE|UPDATE|DELETE/);
      expect(params.slice(0, 3)).toEqual([37, 301, 'AAPL']);
      state.archive.push({ ledger_id: params[0], category_id: params[1], symbol: params[2], price: params[3], price_date: params[4],
        captured_at: new Date(Date.now()).toISOString(), source: sql.includes("'close'") ? 'close' : 'intraday' });
      return [{ insertId: state.archive.length }];
    }
    if (sql.includes('INSERT INTO ledger_stock_intraday_quotes') || sql.includes('INSERT INTO ledger_stock_price_snapshots')) {
      expect(sql).toContain('ON DUPLICATE KEY UPDATE');
      const latest = { symbol: params[2], price: params[3], price_date: params[4], captured_at: new Date(Date.now()).toISOString() };
      if (sql.includes('INSERT INTO ledger_stock_intraday_quotes')) state.latestIntraday = latest;
      else state.latestClose = latest;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM ledger_stock_quote_history')) {
      expect(sql).toContain('ROW_NUMBER() OVER');
      expect(sql).toContain('price_date DESC, captured_at DESC, id DESC');
      expect(sql).toContain('price_date <= ? AND captured_at < DATE_ADD(?, INTERVAL 1 DAY)');
      expect(params).toEqual([37, 301, 'AAPL', pauseDate, pauseDate]);
      const cutoff = Date.parse(`${pauseDate}T00:00:00+08:00`) + 86400000;
      const rows = state.archive.filter((q) => q.price_date <= pauseDate && Date.parse(q.captured_at) < cutoff)
        .sort((a, b) => b.price_date.localeCompare(a.price_date) || b.captured_at.localeCompare(a.captured_at));
      return [rows.slice(0, 1)];
    }
    if (sql.includes('FROM ledger_stock_price_snapshots') || sql.includes('FROM ledger_stock_intraday_quotes')) {
      const latest = sql.includes('FROM ledger_stock_price_snapshots') ? state.latestClose : state.latestIntraday;
      const historical = sql.includes('DATE_ADD');
      return [latest && (!historical || (latest.price_date <= pauseDate
        && Date.parse(latest.captured_at) < Date.parse(`${pauseDate}T00:00:00+08:00`) + 86400000)) ? [latest] : []];
    }
    if (sql.includes('FROM ledger_stock_daily_snapshots')) return [[]];
    if (sql.includes('INSERT INTO ledger_stock_daily_snapshots')) { state.dailyWrites += 1; return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM us_stock_basic')) return [[]];
    if (sql.includes('FROM ledger_stock_events e')) return [[]];
    return base(sql, params);
  });
  return state;
}

function setMockClockAndQuote(capturedAt: string, priceDate: string, price: number) {
  vi.mocked(Date.now).mockReturnValue(Date.parse(capturedAt));
  vi.mocked(fetchIntradayStockQuotes).mockResolvedValue({ AAPL: { price, priceDate, updatedAt: capturedAt } } as any);
}

describe('暂停报价不可覆写档案（全mock，不执行DDL或调度器）', () => {
  it('独立ensure仅CREATE一张37报价历史表，无ALTER/UPDATE/INSERT钱包及历史回填', async () => {
    // 新模块只重置内存初始化标记；数据库模块仍全mock，不读取环境连接。
    vi.resetModules();
    const isolated = await import('./ledger-stock-portfolio');
    mocks.execute.mockResolvedValue([{ affectedRows: 0 }]);
    await isolated.ensureLedgerStockQuoteHistoryTable();
    await isolated.ensureLedgerStockQuoteHistoryTable();
    expect(mocks.execute).toHaveBeenCalledOnce();
    const sql = mocks.execute.mock.calls[0][0];
    expect(sql).toMatch(/^\s*CREATE TABLE IF NOT EXISTS ledger_stock_quote_history/);
    expect(sql).toContain("source ENUM('intraday','close')");
    expect(sql).not.toMatch(/UNIQUE|ALTER|INSERT|UPDATE|DELETE|wallet|balance|deposit|recharge/);
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });

  it('原盘中任务逐次append旧交易日，未来覆写intraday后仍冻结pause前报价', async () => {
    const state = installArchiveRefreshMock();
    setMockClockAndQuote(`${pauseDate}T07:00:00Z`, pauseDate, 8);
    expect(await refreshLedgerStockTagIntradaySnapshots()).toEqual({ categories: 1, symbols: 1, updated: 1 });
    const frozen = await getStockObservationPauseContext(101, pauseDate);
    expect(frozen?.quote).toMatchObject({ price: 8, source: 'intraday', priceDate: pauseDate });
    // 同一纽约交易日的新捕获也不能跨过北京时间暂停日。
    setMockClockAndQuote('2026-11-03T01:00:00Z', pauseDate, 50);
    await refreshLedgerStockTagIntradaySnapshots();
    setMockClockAndQuote('2026-11-05T01:00:00Z', today, 99);
    await refreshLedgerStockTagIntradaySnapshots();
    expect(state.latestIntraday?.price).toBe(99);
    expect(state.archive.map((q) => [q.price, q.source])).toEqual([[8, 'intraday'], [50, 'intraday'], [99, 'intraday']]);
    expect(await getStockObservationPauseContext(101, pauseDate)).toEqual(frozen);
    expect(state.dailyWrites).toBe(0);
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });

  it('原盘尾任务append并保留当次capturedAt；同交易日future重写close不能丢失冻结价', async () => {
    const state = installArchiveRefreshMock();
    setMockClockAndQuote(`${pauseDate}T07:05:00Z`, pauseDate, 9);
    await refreshLedgerStockTagCloseSnapshots({ categoryId: 301 });
    const frozen = await getStockObservationPauseContext(101, pauseDate);
    expect(frozen?.quote).toMatchObject({ price: 9, source: 'close', priceDate: pauseDate });
    setMockClockAndQuote('2026-11-05T07:05:00Z', pauseDate, 19);
    await refreshLedgerStockTagCloseSnapshots({ categoryId: 301, snapshotDate: pauseDate });
    expect(state.latestClose).toMatchObject({ price: 19, price_date: pauseDate, captured_at: '2026-11-05T07:05:00.000Z' });
    expect(state.archive.map((q) => [q.price, q.captured_at, q.source])).toEqual([
      [9, `${pauseDate}T07:05:00.000Z`, 'close'], [19, '2026-11-05T07:05:00.000Z', 'close'],
    ]);
    expect(await getStockObservationPauseContext(101, pauseDate)).toEqual(frozen);
  });

  it('archive优先同日更晚capture，pause 23:59:59可取，次日00:00与未来priceDate均拒绝', async () => {
    const state = installArchiveRefreshMock();
    state.archive.push(
      { symbol: 'AAPL', price: 9, price_date: pauseDate, captured_at: `${pauseDate}T07:05:00Z`, source: 'close' },
      { symbol: 'AAPL', price: 8, price_date: pauseDate, captured_at: `${pauseDate}T15:59:59Z`, source: 'intraday' },
      { symbol: 'AAPL', price: 50, price_date: pauseDate, captured_at: `${pauseDate}T16:00:00Z`, source: 'intraday' },
      { symbol: 'AAPL', price: 99, price_date: '2026-11-03', captured_at: `${pauseDate}T07:00:00Z`, source: 'close' },
    );
    expect((await getStockObservationPauseContext(101, pauseDate))?.quote).toMatchObject({ price: 8, source: 'intraday', updatedAt: `${pauseDate}T15:59:59.000Z` });
    expect(mocks.execute.mock.calls.some(([sql]) => /FROM ledger_stock_(intraday_quotes|price_snapshots)|market_reference_price/.test(sql))).toBe(false);
  });

  it('archive无pause当日报价使用更早历史，而不是future或更晚覆写旧close', async () => {
    const state = installArchiveRefreshMock();
    state.archive.push({ symbol: 'AAPL', price: 7, price_date: '2026-10-30', captured_at: '2026-10-30T07:00:00Z', source: 'intraday' });
    state.latestClose = { symbol: 'AAPL', price: 20, price_date: pauseDate, captured_at: `${pauseDate}T07:05:00Z` };
    expect((await getStockObservationPauseContext(101, pauseDate))?.quote).toMatchObject({ price: 7, priceDate: '2026-10-30', source: 'intraday' });
  });

  it('旧历史无archive安全兜底已保存截止前快照，仅SELECT，无补写/ensure', async () => {
    installPauseReadMock();
    const result = await getStockObservationPauseContext(101, pauseDate);
    expect(result?.quote).toMatchObject({ price: 9, source: 'close' });
    expect(mocks.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('FROM ledger_stock_quote_history'))).toBe(false);
  });

  it('旧历史只剩futurequote，无archive可用时保持null，不以入场价、fake0或future回退', async () => {
    installPauseReadMock({ unpriced: true });
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql: string, ...args) => {
      if (sql.includes('FROM ledger_stock_price_snapshots') || sql.includes('FROM ledger_stock_intraday_quotes')) {
        return [[{ symbol: '600000.SH', price: 100, price_date: pauseDate, captured_at: '2026-11-05T01:00:00Z' }]];
      }
      return base(sql, ...args);
    });
    expect((await getStockObservationPauseContext(101, pauseDate))?.quote).toBeNull();
    expect((await getMyStockTagObservationPortfolio(accessInput)).holdings[0]).toMatchObject({ status: 'paused', totalPnl: null, marketPrice: null });
  });

  it('无可用archive但安全旧reference保留，future旧quote不能遮蔽合法更早价', async () => {
    installPauseReadMock();
    const base = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation(async (sql: string, ...args) => {
      if (sql.includes('FROM ledger_stock_price_snapshots') || sql.includes('FROM ledger_stock_intraday_quotes')) {
        return [[{ symbol: '600000.SH', price: 100, price_date: '2026-11-05', captured_at: '2026-11-05T01:00:00Z' }]];
      }
      return base(sql, ...args);
    });
    expect((await getStockObservationPauseContext(101, pauseDate))?.quote).toMatchObject({ price: 11, source: 'reference', priceDate: '2026-10-01' });
  });

  it.each([0, NaN, Infinity])('无效报价%s原刷新不写旧表也不append档案', async (price) => {
    const state = installArchiveRefreshMock();
    setMockClockAndQuote(`${pauseDate}T07:00:00Z`, pauseDate, price);
    expect((await refreshLedgerStockTagIntradaySnapshots()).updated).toBe(0);
    expect((await refreshLedgerStockTagCloseSnapshots()).updated).toBe(0);
    expect(state.archive).toEqual([]);
    expect(state.latestClose).toBeNull();
    expect(state.latestIntraday).toBeNull();
  });
});
