import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatStockComparisonDate,
  getStockComparison,
  getStockComparisonMarket,
  getStockComparisonRates,
  type StockComparisonDb,
  type StockComparisonPeriod,
} from './stock-comparison';

// Only pure helpers / injected in-memory execute stubs. No database module,
// networking, initialization, DDL or writes are imported or executed.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T06:59:59Z')); // Beijing before 15:00
});
afterEach(() => vi.useRealTimers());

const dailyRow = {
  ts_code: '600000.SH', name: '测试样本', list_status: 'L',
  up_days: '1', down_days: '1', flat_days: '1', total_days: '3',
  last_trade_date: '20261103',
};
function dailyDb(dates = ['20261104', '20261103', '20261102', '20261030'], rows = [dailyRow]) {
  const execute = vi.fn(async (sql: string, _params?: any[]) => {
    if (sql.includes('SELECT DISTINCT')) return [dates.map(trade_date => ({ trade_date })), []];
    return [rows, []];
  });
  return { execute };
}

describe('股票对比纯函数', () => {
  it.each([
    ['600000.SH', 'SH'], ['601001.SH', 'SH'], ['689001.SH', 'SH'],
    ['000001.SZ', 'SZ'], ['002001.SZ', 'SZ'], ['300001.SZ', 'GEM'],
    ['301001.SZ', 'GEM'], ['688001.SH', 'STAR'], ['302001.SZ', 'OTHER'],
    ['920001.BJ', 'OTHER'], ['', 'OTHER'],
  ])('市场%s映射为%s', (code, market) => {
    expect(getStockComparisonMarket(code)).toBe(market);
  });

  it('只输出实际有效日期，不制造空日期或无效日期', () => {
    expect(formatStockComparisonDate('20261104')).toBe('2026-11-04');
    expect(formatStockComparisonDate('2026-11-04')).toBe('2026-11-04');
    expect(formatStockComparisonDate('20280229')).toBe('2028-02-29');
    for (const invalid of [null, undefined, '', '20260229', '20261131', 20261104, '2026-11-04T00:00:00Z']) {
      expect(formatStockComparisonDate(invalid)).toBeNull();
    }
  });

  it('涨跌平率以实际totalDays为分母，不使用请求天数且不提前四舍五入', () => {
    expect(getStockComparisonRates(1, 1, 1, 3)).toEqual({
      upRate: 1 / 3 * 100, downRate: 1 / 3 * 100, flatRate: 1 / 3 * 100,
    });
    expect(getStockComparisonRates(0, 0, 0, 0)).toEqual({ upRate: 0, downRate: 0, flatRate: 0 });
  });
});

describe('注入只读execute的近期合同', () => {
  it('统一全市场窗口、不足N保留实际窗口数和个股样本数；停牌个股保留自己的最后日期', async () => {
    const db = dailyDb();
    const result = await getStockComparison(db, { period: '30' });
    expect(result).toEqual({
      period: '30', asOf: '2026-11-04', windowStart: '2026-10-30',
      windowTradingDays: 4, generatedAt: '2026-11-05', source: 'daily',
      items: [{
        tsCode: '600000.SH', name: '测试样本', listStatus: 'L', market: 'SH',
        upDays: 1, downDays: 1, flatDays: 1, totalDays: 3,
        upRate: 1 / 3 * 100, downRate: 1 / 3 * 100, flatRate: 1 / 3 * 100,
        lastTradeDate: '2026-11-03', updatedAt: null,
      }],
    });
    expect(db.execute).toHaveBeenCalledTimes(2);
    const [datesSql, datesParams] = db.execute.mock.calls[0];
    expect(datesSql).toMatch(/SELECT DISTINCT d\.trade_date/);
    expect(datesSql).toContain('FORCE INDEX (idx_trade_date)');
    expect(datesSql).toContain('LIMIT 30');
    expect(datesParams).toEqual(['20261104']);
    const [aggregateSql, aggregateParams] = db.execute.mock.calls[1];
    expect(aggregateParams).toEqual(['20261030', '20261104']);
    expect(aggregateSql).toContain("b.list_status IN ('L', 'D')");
    expect(aggregateSql).toContain('GROUP BY d.ts_code, b.name, b.list_status');
    expect(aggregateSql).toContain('COUNT(d.pct_chg) AS total_days');
    expect(aggregateSql).toContain('CASE WHEN d.pct_chg = 0 THEN 1 ELSE 0 END');
    expect(aggregateSql).not.toMatch(/COALESCE|IFNULL/);
    expect(aggregateSql).toContain('MAX(d.trade_date) AS last_trade_date');
    for (const [sql] of db.execute.mock.calls) expect(sql.trim()).toMatch(/^SELECT\s/);
  });

  it.each(['30', '60', '90', '180', '365'] as const)('period=%s严格映射LIMIT，不按自然日', async period => {
    const db = dailyDb();
    await getStockComparison(db, { period });
    expect(db.execute.mock.calls[0][0]).toContain(`LIMIT ${period}`);
  });

  it('15:00后cutoff改变；asOf仍是实际来源最新日期，数据尚未发布不冒充今天', async () => {
    const db = dailyDb();
    await getStockComparison(db, { period: '30' });
    vi.setSystemTime(new Date('2026-11-05T07:00:00Z'));
    const result = await getStockComparison(db, { period: '30' });
    expect(db.execute).toHaveBeenCalledTimes(4);
    expect(db.execute.mock.calls[2][1]).toEqual(['20261105']);
    expect(result.asOf).toBe('2026-11-04');
  });

  it('源表没有截止之前的数据时不执行汇总、不捏造日期或窗口', async () => {
    const db = dailyDb([]);
    expect(await getStockComparison(db, { period: '365' })).toEqual({
      period: '365', asOf: null, windowStart: null, windowTradingDays: 0,
      generatedAt: '2026-11-05', source: 'daily', items: [],
    });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('只有未知pct_chg时保留0有效样本与真实最后日期，不虚算平盘', async () => {
    const db = dailyDb(['20261104'], [{ ...dailyRow, up_days: '0', down_days: '0',
      flat_days: '0', total_days: '0', last_trade_date: '20261104' }]);
    const result = await getStockComparison(db, { period: '30' });
    expect(result.items[0]).toMatchObject({ totalDays: 0, flatDays: 0,
      upRate: 0, downRate: 0, flatRate: 0, lastTradeDate: '2026-11-04' });
  });

  it('退市个股在窗口内有真实样本仍纳入，市场映射不依赖listStatus', async () => {
    const db = dailyDb(['20261104'], [{ ...dailyRow, ts_code: '301001.SZ', list_status: 'D' }]);
    expect((await getStockComparison(db, { period: '60' })).items[0])
      .toMatchObject({ tsCode: '301001.SZ', listStatus: 'D', market: 'GEM' });
  });
});

describe('全期为历史缓存，不是今日统一截止行情', () => {
  it('INNER JOIN有效样本、真实行更新时间、重算三项rates且所有行情日期null', async () => {
    const execute = vi.fn(async (_sql: string, _params?: any[]) => [[{
      ...dailyRow, ts_code: '688001.SH', up_days: '2', total_days: '4',
      up_rate: '99.99', updated_at: '2026-10-28', last_trade_date: '20261104',
    }], []]);
    const result = await getStockComparison({ execute }, { period: 'lifetime' });
    expect(result).toMatchObject({ period: 'lifetime', asOf: null, windowStart: null,
      windowTradingDays: null, generatedAt: '2026-11-05', source: 'lifecycle' });
    expect(result.items[0]).toMatchObject({ totalDays: 4, upRate: 50, downRate: 25,
      flatRate: 25, lastTradeDate: null, updatedAt: '2026-10-28', market: 'STAR' });
    expect(execute).toHaveBeenCalledTimes(1);
    const sql = execute.mock.calls[0][0];
    expect(sql.trim()).toMatch(/^SELECT\s/);
    expect(sql).toContain('INNER JOIN ts_stock_basic');
    expect(sql).toContain('l.total_days > 0');
    expect(sql).toContain("b.list_status IN ('L', 'D')");
    expect(sql).toContain("DATE_FORMAT(l.updated_at, '%Y-%m-%d') AS updated_at");
    expect(sql).not.toContain('ts_daily');
  });

  it('缓存行更新时间缺失保留null，不用generatedAt补齐', async () => {
    const db: StockComparisonDb = { execute: async () => [[{ ...dailyRow, updated_at: null }], []] };
    expect((await getStockComparison(db, { period: 'lifetime' })).items[0].updatedAt).toBeNull();
  });
});

describe('内存缓存/失败边界（不连接任何DB）', () => {
  it('相同executor/period/cutoff合并并发，成功结果90秒过期', async () => {
    const db = dailyDb();
    const results = await Promise.all(Array.from({ length: 8 }, () => getStockComparison(db, { period: '30' })));
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(results.every(result => result === results[0])).toBe(true);
    vi.setSystemTime(new Date('2026-11-05T07:01:00Z')); // different cutoff intentionally queries
    await getStockComparison(db, { period: '30' });
    expect(db.execute).toHaveBeenCalledTimes(4);
    vi.setSystemTime(new Date('2026-11-05T07:02:29Z'));
    await getStockComparison(db, { period: '30' });
    expect(db.execute).toHaveBeenCalledTimes(4);
    vi.setSystemTime(new Date('2026-11-05T07:02:30Z'));
    await getStockComparison(db, { period: '30' });
    expect(db.execute).toHaveBeenCalledTimes(6);
  });

  it('executor间隔离，不给另一个DB返回前一个DB缓存', async () => {
    const first = dailyDb();
    const second = dailyDb(['20261103']);
    expect((await getStockComparison(first, { period: '90' })).asOf).toBe('2026-11-04');
    expect((await getStockComparison(second, { period: '90' })).asOf).toBe('2026-11-03');
    expect(first.execute).toHaveBeenCalledTimes(2);
    expect(second.execute).toHaveBeenCalledTimes(2);
  });

  it('结果缓存最多12keys，触碰更新LRU顺序，超过上限淘汰最旧未触碰项', async () => {
    // Move the fake clock backwards so older entries remain unexpired while
    // generating distinct cutoffs. In real time the 90s TTL is another bound.
    const execute = vi.fn(async (_sql: string, _params?: any[]) => [[], []]);
    const db = { execute };
    const periods: StockComparisonPeriod[] = ['30', '60', '90', '180', '365', 'lifetime'];
    for (const period of periods) await getStockComparison(db, { period });
    await getStockComparison(db, { period: '30' }); // Touch: 60 is now oldest.
    vi.setSystemTime(new Date('2026-11-04T06:59:59Z'));
    for (const period of periods) await getStockComparison(db, { period });
    expect(execute).toHaveBeenCalledTimes(12);
    vi.setSystemTime(new Date('2026-11-03T06:59:59Z'));
    await getStockComparison(db, { period: '30' }); // 13th key evicts initial 60.
    expect(execute).toHaveBeenCalledTimes(13);
    vi.setSystemTime(new Date('2026-11-05T06:59:59Z'));
    await getStockComparison(db, { period: '30' });
    expect(execute).toHaveBeenCalledTimes(13); // The touched original 30 survived.
    await getStockComparison(db, { period: '60' });
    expect(execute).toHaveBeenCalledTimes(14); // Evicted 60 requires a new SELECT.
  });

  it('SELECT失败抛出并清理inflight，随后允许重试，不返回伪空数据', async () => {
    const db = dailyDb();
    db.execute.mockRejectedValueOnce(new Error('read failed'));
    await expect(getStockComparison(db, { period: '30' })).rejects.toThrow('read failed');
    expect((await getStockComparison(db, { period: '30' })).items).toHaveLength(1);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it('不合法period拒绝，不执行SQL也不插入不受信任LIMIT', async () => {
    const db = dailyDb();
    await expect(getStockComparison(db, { period: '30;DROP TABLE ts_daily' as StockComparisonPeriod }))
      .rejects.toThrow(RangeError);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('DB异常返回或计数不合法明确失败，不默认为0并缓存', async () => {
    for (const result of [undefined, { rows: [] }, [[{ ...dailyRow, total_days: null }], []]]) {
      const db: StockComparisonDb = { execute: async () => result };
      await expect(getStockComparison(db, { period: 'lifetime' })).rejects.toThrow(TypeError);
    }
  });

  it('窗口返回未来/非法交易日拒绝，不冒充已完成日', async () => {
    for (const date of ['20261105', '20260229', '']) {
      await expect(getStockComparison(dailyDb([date]), { period: '30' })).rejects.toThrow(TypeError);
    }
  });

  it('亦接受只返回rows的注入adapter', async () => {
    const db: StockComparisonDb = { execute: async () => [{ ...dailyRow, updated_at: '2026-10-28' }] };
    expect((await getStockComparison(db, { period: 'lifetime' })).items).toHaveLength(1);
  });
});
