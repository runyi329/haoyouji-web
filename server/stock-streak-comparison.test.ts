import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getStockStreakComparison, getStockStreakLengths,
  type StockStreakComparisonInput, type StockStreakComparisonMarket,
} from './stock-streak-comparison';
import { type StockComparisonDb } from './stock-comparison';

// Pure fixtures/injected execute only: no DB initialization, DDL, writes, routers,
// network requests, collector imports or lifecycle caches are run by these tests.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T06:59:59Z')); // Beijing 14:59:59
});
afterEach(() => vi.useRealTimers());

type Quote = { tradeDate: string; pctChange: unknown };
type Stock = { ts_code: string; name: string; list_status: string; rows: Quote[] };
const input: StockStreakComparisonInput = { period: '30', market: 'all' };
const dates = ['20261030', '20261102', '20261103', '20261104'];
function stock(ts_code: string, values: unknown[], overrides: Partial<Stock> = {}): Stock {
  return { ts_code, name: `样本${ts_code}`, list_status: 'L',
    rows: values.map((pctChange, i) => ({ tradeDate: dates[i], pctChange })), ...overrides };
}

// Independent in-memory ROW_NUMBER/island oracle, NOT the pure streak helper.
// This models the generated SQL over its known DECIMAL/NULL quote input. It also
// allows invalid fixture quotes as SQL NULL to verify the helper's stricter input.
function islands(rows: readonly Quote[]) {
  const kept = [...rows].sort((a, b) => a.tradeDate < b.tradeDate ? -1 : 1)
    .map(row => {
      const value = row.pctChange;
      const valid = typeof value === 'number' || (typeof value === 'string'
        && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value));
      const pct = valid ? Number(value) : NaN;
      return Number.isFinite(pct) ? Math.sign(pct) : null;
    }).filter(direction => direction !== 0);
  const directionalRowNumbers = new Map<number | null, number>();
  const groups = new Map<string, { direction: number; days: number }>();
  kept.forEach((direction, i) => {
    const directionalNumber = (directionalRowNumbers.get(direction) ?? 0) + 1;
    directionalRowNumbers.set(direction, directionalNumber);
    if (direction === null) return;
    const key = `${direction}:${i + 1 - directionalNumber}`;
    const group = groups.get(key) ?? { direction, days: 0 };
    group.days++;
    groups.set(key, group);
  });
  const max = (direction: number) => Math.max(0,
    ...Array.from(groups.values()).filter(group => group.direction === direction).map(group => group.days));
  return { upDays: max(1), downDays: max(-1) };
}

function sampleDb(stocks: Stock[], unpublishedDates: string[] = []) {
  const execute = vi.fn(async (sql: string, params: any[] = []): Promise<unknown> => {
    if (sql.includes('AS data_updated_at')) return [[{ data_updated_at: '2026-11-04T08:00:00Z' }], []];
    if (sql.includes('SELECT DISTINCT d.trade_date')) {
      const n = Number(sql.match(/LIMIT (\d+)/)?.[1]);
      const dates = Array.from(new Set([...stocks.flatMap(s => s.rows.map(row => row.tradeDate)), ...unpublishedDates]))
        .filter(date => date <= params[0]).sort().reverse().slice(0, n);
      return [dates.map(trade_date => ({ trade_date })), []];
    }
    const [start, end, status, pattern] = params;
    const keyword = pattern === undefined ? '' : String(pattern).slice(1, -1).replace(/!([!%_])/g, '$1');
    const eligible = stocks.filter(s => {
      if (s.list_status !== status) return false;
      if (sql.includes("AND b.ts_code LIKE '688%'")) return s.ts_code.startsWith('688');
      if (sql.includes("b.ts_code LIKE '6%'")) return s.ts_code.startsWith('6') && !s.ts_code.startsWith('688');
      if (sql.includes("b.ts_code LIKE '0%'")) return s.ts_code.startsWith('0');
      if (sql.includes("b.ts_code LIKE '300%'")) return s.ts_code.startsWith('300') || s.ts_code.startsWith('301');
      return true;
    }).filter(s => !keyword || s.ts_code.includes(keyword) || s.name.includes(keyword));
    const maxima = eligible.map(s => ({ ...s,
      ...islands(s.rows.filter(row => row.tradeDate >= start && row.tradeDate <= end)),
    })).filter(s => s.upDays > 0 || s.downDays > 0);
    const top = (field: 'upDays' | 'downDays') => [...maxima].sort((a, b) => b[field] - a[field]
      || (a.ts_code < b.ts_code ? -1 : 1)).filter(s => s[field] > 0).slice(0, 100);
    const selected = new Set([...top('upDays'), ...top('downDays')]);
    return [Array.from(selected).reverse().map(s => ({ ts_code: s.ts_code, name: s.name,
      up_days: String(s.upDays), down_days: String(s.downDays) })), []];
  });
  return { execute };
}

function rawDb(
  rows: Record<string, unknown>[] = [{ ts_code: '600001.SH', name: '样本', up_days: '1', down_days: '0' }],
  tradeDates = ['20261104'], direct = false,
) {
  const execute = vi.fn(async (sql: string, _params?: any[]): Promise<unknown> => {
    const result = sql.includes('AS data_updated_at') ? [{ data_updated_at: null }]
      : sql.includes('SELECT DISTINCT') ? tradeDates.map(trade_date => ({ trade_date })) : rows;
    return direct ? result : [result, []];
  });
  return { execute };
}

function weekdayDates(n: number): string[] {
  const result: string[] = [];
  const date = new Date('2026-11-04T00:00:00Z');
  while (result.length < n) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) result.unshift(date.toISOString().slice(0, 10).replace(/-/g, ''));
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return result;
}

describe('最长连涨跌纯口径', () => {
  it('平盘不计天、不中断，方向切换按最长段而非总上涨天数', () => {
    const values = [1, 0, 2, -1, 0, -2, -3, 1, 1];
    const rows = values.map((pctChange, i) => ({ tradeDate: `202610${String(i + 1).padStart(2, '0')}`, pctChange }));
    expect(getStockStreakLengths(rows, '20261104')).toEqual({ upDays: 2, downDays: 3 });
    expect(getStockStreakLengths(rows.map(row => ({ ...row, pctChange: 0 })), '20261104'))
      .toEqual({ upDays: 0, downDays: 0 });
  });

  it.each([null, undefined, '', ' ', 'garbage', 'NaN', 'Infinity', NaN, Infinity, -Infinity, true, {}, '0x10'])
   ('无效报价%s打断，不转换为平盘或方向', bad => {
      const rows = [1, bad, 0, '1.25', '+2.0', '-1', bad, '-2'].map((pctChange, i) => ({
        tradeDate: `202610${String(i + 1).padStart(2, '0')}`, pctChange,
      }));
      expect(getStockStreakLengths(rows, '20261104')).toEqual({ upDays: 2, downDays: 1 });
    });

  it('只用真实截止行，先同日去重再升序；周末停牌不制造天数', () => {
    const rows = [
      { tradeDate: '20261104', pctChange: 1 },
      { tradeDate: '20261030', pctChange: 1 }, // weekend and suspension gap
      { tradeDate: '20261104', pctChange: -1 }, // first quote wins
      { tradeDate: '20261105', pctChange: 1 },
      { tradeDate: '20260229', pctChange: 1 },
    ];
    expect(getStockStreakLengths(rows, '20261104')).toEqual({ upDays: 2, downDays: 0 });
    expect(getStockStreakLengths([], '20261104')).toEqual({ upDays: 0, downDays: 0 });
  });

  it('四种方向/平/未知的小样本全组合与独立ROW_NUMBER分段等价', () => {
    // 4^6 fixtures verify null remains inside both ROW_NUMBER computations and
    // zeros are removed before them. No production DB/SQL engine is involved.
    const choices = [1, -1, 0, null];
    for (let code = 0; code < 4 ** 6; code++) {
      let value = code;
      const rows: Quote[] = [];
      for (let i = 0; i < 6; i++) {
        rows.push({ tradeDate: `2026100${i + 1}`, pctChange: choices[value % 4] });
        value = Math.floor(value / 4);
      }
      expect(getStockStreakLengths(rows, '20261104')).toEqual(islands(rows));
    }
  });
});

describe('共同已完成窗口 / 注入小样本', () => {
  it('全市场窗口不足N用实际天数；平盘桥接、null断开、停牌缺行不计天', async () => {
    const samples = [
      stock('600001.SH', [1, 0, 1, 1]),
      stock('000001.SZ', [-1, null, -1, -1]),
      stock('300001.SZ', [1, -1, 1, -1]),
      stock('688001.SH', [], { rows: [{ tradeDate: '20261030', pctChange: 1 }, { tradeDate: '20261104', pctChange: 1 }] }),
      stock('600002.SH', [0, 0, 0, 0]),
      stock('600003.SH', [null, null, null, null]),
    ];
    const db = sampleDb(samples, ['20261105']);
    const result = await getStockStreakComparison(db, input);
    expect(result).toEqual({ period: '30', asOf: '2026-11-04', windowStart: '2026-10-30', windowTradingDays: 4,
      fetchedAt: '2026-11-05T06:59:59.000Z',
      dataUpdatedAt: '2026-11-04T08:00:00Z',
      up: [
        { tsCode: '600001.SH', name: '样本600001.SH', days: 3 },
        { tsCode: '688001.SH', name: '样本688001.SH', days: 2 },
        { tsCode: '300001.SZ', name: '样本300001.SZ', days: 1 },
      ],
      down: [
        { tsCode: '000001.SZ', name: '样本000001.SZ', days: 2 },
        { tsCode: '300001.SZ', name: '样本300001.SZ', days: 1 },
      ],
    });
    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(db.execute.mock.calls[1][1]).toEqual(['20261030', '20261104', 'L']);
    expect(db.execute.mock.calls[2][1]).toEqual(['20261104']);
  });

  it('15:00前后传入不同截止，今天未发布仍不冒充今天；发布后只计真实行', async () => {
    const db = sampleDb([stock('600001.SH', [1, 1, 1, 1], { rows: [
      { tradeDate: '20261104', pctChange: 1 }, { tradeDate: '20261105', pctChange: 1 },
    ] })]);
    expect((await getStockStreakComparison(db, input)).asOf).toBe('2026-11-04');
    expect(db.execute.mock.calls[0][1]).toEqual(['20261104']);
    vi.setSystemTime(new Date('2026-11-05T07:00:00Z'));
    const after = await getStockStreakComparison(db, input);
    expect(after.asOf).toBe('2026-11-05');
    expect(after.windowTradingDays).toBe(2);
    expect(after.up[0].days).toBe(2);
    expect(db.execute.mock.calls[3][1]).toEqual(['20261105']);
    expect((await getStockStreakComparison(rawDb(), input)).asOf).toBe('2026-11-04');
  });

  it('周末截止不生成周末行或日期', async () => {
    vi.setSystemTime(new Date('2026-11-07T08:00:00Z')); // Saturday after 15:00 Beijing
    const db = rawDb([], ['20261106', '20261105']);
    const result = await getStockStreakComparison(db, input);
    expect(result).toMatchObject({ asOf: '2026-11-06', windowTradingDays: 2 });
    expect(db.execute.mock.calls[0][1]).toEqual(['20261107']);
  });

  it('收盘后源DB新增真实日线在90秒到期后可见，缓存命中不伪造fetchedAt', async () => {
    vi.setSystemTime(new Date('2026-11-05T07:00:00Z'));
    const sample = stock('600001.SH', [], { rows: [{ tradeDate: '20261104', pctChange: 1 }] });
    const db = sampleDb([sample]);
    const first = await getStockStreakComparison(db, input);
    expect(first).toMatchObject({ asOf: '2026-11-04', fetchedAt: '2026-11-05T07:00:00.000Z' });
    vi.setSystemTime(new Date('2026-11-05T07:00:30Z'));
    sample.rows.push({ tradeDate: '20261105', pctChange: 1 });
    const cached = await getStockStreakComparison(db, input);
    expect(cached).toBe(first);
    expect(cached.fetchedAt).toBe('2026-11-05T07:00:00.000Z');
    vi.setSystemTime(new Date('2026-11-05T07:01:30Z'));
    const refreshed = await getStockStreakComparison(db, input);
    expect(refreshed).toMatchObject({ asOf: '2026-11-05', windowTradingDays: 2,
      fetchedAt: '2026-11-05T07:01:30.000Z' });
    expect(refreshed.up[0].days).toBe(2);
    expect(db.execute).toHaveBeenCalledTimes(6);
  });

  it('fetchedAt记录聚合查询成功完成UTC时刻，不替换来源行情日期', async () => {
    const db: StockComparisonDb = { execute: async sql => {
      if (sql.includes('AS data_updated_at')) return [[{ data_updated_at: '2026-11-04T08:00:00Z' }], []];
      if (sql.includes('SELECT DISTINCT')) return [[{ trade_date: '20261104' }], []];
      vi.setSystemTime(new Date('2026-11-05T06:59:59.800Z'));
      return [[{ ts_code: '600001.SH', name: '样本', up_days: 1, down_days: 0 }], []];
    } };
    expect(await getStockStreakComparison(db, input)).toMatchObject({ asOf: '2026-11-04',
      fetchedAt: '2026-11-05T06:59:59.800Z' });
  });

  it('周末查询fetchedAt可变，asOf和真实dataUpdatedAt不变；未知来源更新时间保留null', async () => {
    const backing = rawDb([], ['20261106']);
    const execute = vi.fn(async (sql: string, params?: any[]) => sql.includes('AS data_updated_at')
      ? [[{ data_updated_at: '2026-11-06T08:12:34Z' }], []] : backing.execute(sql, params));
    const db = { execute };
    vi.setSystemTime(new Date('2026-11-07T08:00:00Z'));
    const saturday = await getStockStreakComparison(db, input);
    vi.setSystemTime(new Date('2026-11-08T08:00:00Z'));
    const sunday = await getStockStreakComparison(db, input);
    expect(saturday.asOf).toBe('2026-11-06');
    expect(sunday.asOf).toBe(saturday.asOf);
    expect(sunday.dataUpdatedAt).toBe('2026-11-06T08:12:34Z');
    expect(sunday.dataUpdatedAt).toBe(saturday.dataUpdatedAt);
    expect(sunday.fetchedAt).not.toBe(saturday.fetchedAt);
    expect(execute.mock.calls.filter(([sql]) => sql.includes('AS data_updated_at'))
      .map(([, params]) => params)).toEqual([['20261106'], ['20261106']]);
    expect((await getStockStreakComparison(rawDb([], ['20261106']), input)).dataUpdatedAt).toBeNull();
  });

  it('来源更新时间SELECT缺列等错误直接上抛，随后可重试，不用fetchedAt假充采集时间', async () => {
    const backing = rawDb();
    let failed = false;
    const execute = vi.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('AS data_updated_at') && !failed) {
        failed = true;
        throw new Error('Unknown column updated_at');
      }
      return backing.execute(sql, params);
    });
    const db = { execute };
    await expect(getStockStreakComparison(db, input)).rejects.toThrow('Unknown column updated_at');
    const recovered = await getStockStreakComparison(db, input);
    expect(recovered.dataUpdatedAt).toBeNull();
    expect(execute).toHaveBeenCalledTimes(6);
  });

  it.each([undefined, '', '2026-11-04', '2026-11-04T16:00:00+08:00', '2026-02-30T08:00:00Z',
    '2026-11-04T24:00:00Z', new Date('2026-11-04T08:00:00Z')])
   ('无效/driverDate来源更新时间%j不接受、不伪造和缓存', async bad => {
      const backing = rawDb();
      const db: StockComparisonDb = { execute: async (sql, params) => sql.includes('AS data_updated_at')
        ? [[{ data_updated_at: bad }], []] : backing.execute(sql, params) };
      await expect(getStockStreakComparison(db, input)).rejects.toThrow(TypeError);
    });

  it.each(['30', '60', '90', '180', '365'] as const)('period %s按实际交易日LIMIT而非自然日', async period => {
    const db = rawDb();
    const result = await getStockStreakComparison(db, { ...input, period });
    expect(result).toMatchObject({ period, windowTradingDays: 1 });
    expect(db.execute.mock.calls[0][0]).toContain(`LIMIT ${period}`);
  });

  it('最长段只从窗口内起算，不继承窗口前的连续方向/全历史指标', async () => {
    const allDates = weekdayDates(45);
    const db = sampleDb([stock('600001.SH', [], { rows: allDates.map(tradeDate => ({ tradeDate, pctChange: 1 })) })]);
    const result = await getStockStreakComparison(db, input);
    expect(result.windowTradingDays).toBe(30);
    expect(result.up[0].days).toBe(30);
    expect(db.execute.mock.calls[1][1]).toEqual([allDates[15], allDates[44], 'L']);
    expect(result.windowStart?.replace(/-/g, '')).toBe(allDates[15]);
  });

  it('共同窗口不随关键词/市场变化，无匹配不回退历史；最新日期来自全市场', async () => {
    const db = sampleDb([
      stock('688001.SH', [], { rows: [{ tradeDate: '20261030', pctChange: 1 }] }),
      stock('000001.SZ', [], { rows: [{ tradeDate: '20261104', pctChange: 1 }] }),
    ]);
    const gem = await getStockStreakComparison(db, { ...input, market: 'STAR' });
    expect(gem).toMatchObject({ asOf: '2026-11-04', windowStart: '2026-10-30', windowTradingDays: 2 });
    expect(gem.up[0].days).toBe(1);
    const missing = await getStockStreakComparison(db, { ...input, market: 'STAR', keyword: '不存在' });
    expect(missing).toEqual({ ...gem, up: [], down: [] });
    expect(db.execute.mock.calls[0][1]).toEqual(['20261104']);
    expect(db.execute.mock.calls[3][1]).toEqual(['20261104']);
    expect(db.execute.mock.calls[0][0]).not.toMatch(/ts_stock_basic|list_status|name|LIKE/);
  });

  it('无截止日数据只执行一次SELECT，日期null且窗口0', async () => {
    const db = rawDb([], []);
    expect(await getStockStreakComparison(db, { ...input, period: '365' })).toEqual({
      period: '365', asOf: null, windowStart: null, windowTradingDays: 0, up: [], down: [],
      fetchedAt: '2026-11-05T06:59:59.000Z',
      dataUpdatedAt: null,
    });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('榜单独立Top100，降序同分tsCode升序，零天不入榜（不共享一个LIMIT）', async () => {
    const samples: Stock[] = [];
    for (let i = 104; i >= 0; i--) {
      samples.push(stock(`600${String(i).padStart(3, '0')}.SH`, [1, 1, 0, 0]));
      samples.push(stock(`000${String(i).padStart(3, '0')}.SZ`, [-1, -1, -1, 0]));
    }
    samples.push(stock('688001.SH', [1, 1, 1, -1]));
    const result = await getStockStreakComparison(sampleDb(samples), input);
    expect(result.up).toHaveLength(100);
    expect(result.down).toHaveLength(100);
    expect(result.up[0]).toMatchObject({ tsCode: '688001.SH', days: 3 });
    expect(result.up[1].tsCode).toBe('600000.SH');
    expect(result.up[99].tsCode).toBe('600098.SH');
    expect(result.down[0].tsCode).toBe('000000.SZ');
    expect(result.down[99].tsCode).toBe('000099.SZ');
    expect(result.down.some(row => row.tsCode === '688001.SH')).toBe(false);
    expect([...result.up, ...result.down].every(row => row.days > 0)).toBe(true);
  });

  it('即使adapter返回多余乱序行，输出仍按相同规则截到100', async () => {
    const rows = Array.from({ length: 105 }, (_, i) => ({
      ts_code: `600${String(104 - i).padStart(3, '0')}.SH`, name: '样本', up_days: '1', down_days: '0',
    }));
    const result = await getStockStreakComparison(rawDb(rows), input);
    expect(result.up).toHaveLength(100);
    expect(result.up[0].tsCode).toBe('600000.SH');
    expect(result.up[99].tsCode).toBe('600099.SH');
    expect(result.down).toEqual([]);
  });
});

describe('市场 / LIKE / 只读SQL contract', () => {
  const samples = [
    stock('600001.SH', [1], { name: '沪市' }), stock('689001.SH', [1]),
    stock('000001.SZ', [1]), stock('002001.SZ', [1]),
    stock('300001.SZ', [1]), stock('301001.SZ', [1]), stock('302001.SZ', [1]),
    stock('688001.SH', [1]), stock('920001.BJ', [1]),
    stock('600002.SH', [1], { list_status: 'D' }),
    stock('688002.SH', [1], { list_status: 'D' }),
    stock('600003.SH', [1], { list_status: 'P' }),
  ];
  it.each([
    ['all', ['000001.SZ', '002001.SZ', '300001.SZ', '301001.SZ', '302001.SZ', '600001.SH', '688001.SH', '689001.SH', '920001.BJ']],
    ['SH', ['600001.SH', '689001.SH']], ['SZ', ['000001.SZ', '002001.SZ']],
    ['GEM', ['300001.SZ', '301001.SZ']], ['STAR', ['688001.SH']], ['DELISTED', ['600002.SH', '688002.SH']],
  ] as [StockStreakComparisonMarket, string[]][])('%s复用已知前缀且all仅L/DELISTED仅D', async (market, codes) => {
    const db = sampleDb(samples);
    const result = await getStockStreakComparison(db, { ...input, market });
    expect(result.up.map(row => row.tsCode)).toEqual(codes);
    expect(db.execute.mock.calls[1][1]?.[2]).toBe(market === 'DELISTED' ? 'D' : 'L');
  });

  it('关键词literal LIKE escaping绑定参数，注入、引号、%/_/!及反斜线不变成SQL', async () => {
    const keyword = "a%_!\\' OR 1=1 --";
    const db = sampleDb([
      stock('600001.SH', [1], { name: `前缀${keyword}后缀` }),
      stock('600002.SH', [1], { name: 'aOTHER' }),
    ]);
    const result = await getStockStreakComparison(db, { ...input, keyword });
    expect(result.up.map(row => row.tsCode)).toEqual(['600001.SH']);
    const [sql, params] = db.execute.mock.calls[1];
    const pattern = "%a!%!_!!\\' OR 1=1 --%";
    expect(params).toEqual(['20261030', '20261030', 'L', pattern, pattern]);
    expect(sql).toContain("b.ts_code LIKE ? ESCAPE '!' OR b.name LIKE ? ESCAPE '!'");
    expect(sql).not.toContain(keyword);
    expect(sql).not.toContain('OR 1=1');
  });

  it('按代码关键词匹配；空白关键词不加LIKE，并与未给keyword共享缓存', async () => {
    const db = sampleDb(samples);
    const result = await getStockStreakComparison(db, { ...input, keyword: '  301001  ' });
    expect(result.up.map(row => row.tsCode)).toEqual(['301001.SZ']);
    await getStockStreakComparison(db, { ...input, keyword: '301001' });
    expect(db.execute).toHaveBeenCalledTimes(3);
    await getStockStreakComparison(db, { ...input, keyword: '   ' });
    await getStockStreakComparison(db, input);
    expect(db.execute).toHaveBeenCalledTimes(6);
    expect(db.execute.mock.calls[4][1]).toHaveLength(3);
  });

  it('三条SQL均SELECT、日期索引/范围不包函数；只用已知列，无WITH/全历史/逐股请求', async () => {
    const db = rawDb();
    await getStockStreakComparison(db, input);
    const [windowSql] = db.execute.mock.calls[0];
    const [sql, params] = db.execute.mock.calls[1];
    for (const [query] of db.execute.mock.calls) {
      expect(query.trim()).toMatch(/^SELECT\s/);
      expect(query).toContain('FORCE INDEX (idx_trade_date)');
      expect(query).not.toMatch(/\b(WITH|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
      expect(query).not.toMatch(/ts_stock_lifecycle|ts_daily_basic|list_date|exchange|market\s*=/i);
      expect(query).not.toMatch(/(?:DATE|DATE_FORMAT|STR_TO_DATE|CAST)\s*\(\s*d\.trade_date/i);
    }
    expect(windowSql).toContain('WHERE d.trade_date <= ?');
    expect(windowSql).toContain('ORDER BY d.trade_date DESC');
    expect(windowSql).toContain('LIMIT 30');
    expect(sql).toContain('WHERE d.trade_date >= ? AND d.trade_date <= ?');
    expect(params).toEqual(['20261104', '20261104', 'L']);
    expect(sql.match(/FROM ts_daily/g)).toHaveLength(1);
    expect(sql).toContain('INNER JOIN ts_stock_basic AS b ON b.ts_code = d.ts_code');
    expect(sql).toContain('WHEN d.pct_chg = 0 THEN 0 ELSE NULL END AS direction');
    expect(sql).not.toMatch(/COALESCE|IFNULL/);
    expect(sql).toContain('WHERE classified.direction IS NULL OR classified.direction <> 0');
    expect(sql).toContain('PARTITION BY observed.ts_code ORDER BY observed.trade_date');
    expect(sql).toContain('PARTITION BY observed.ts_code, observed.direction ORDER BY observed.trade_date');
    // The null filter must be OUTSIDE the window expressions; otherwise +,NULL,+
    // would incorrectly become a two-day up run. Classified flat filter is inner.
    expect(sql.indexOf('WHERE segmented.direction IS NOT NULL')).toBeGreaterThan(sql.indexOf(') AS segmented'));
    expect(sql).toContain('GROUP BY segmented.ts_code, segmented.name, segmented.direction, segmented.streak_group');
    expect(sql).toContain('ORDER BY maxima.up_days DESC, maxima.ts_code ASC');
    expect(sql).toContain('ORDER BY maxima.down_days DESC, maxima.ts_code ASC');
    expect(sql).toContain('(ranked.up_days > 0 AND ranked.up_rank <= 100)');
    expect(sql).toContain('OR (ranked.down_days > 0 AND ranked.down_rank <= 100)');
    expect(sql).not.toMatch(/LIMIT\s+100/); // a common LIMIT would truncate one list
    expect(sql.match(/\?/g)).toHaveLength(params?.length ?? 0);
    const [timestampSql, timestampParams] = db.execute.mock.calls[2];
    expect(timestampSql).toContain('WHERE d.trade_date = ?');
    expect(timestampSql).toContain('DATE_SUB(MAX(d.updated_at), INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)');
    expect(timestampSql).toContain("'%Y-%m-%dT%H:%i:%sZ'");
    expect(timestampParams).toEqual(['20261104']);
    expect(timestampSql).not.toMatch(/LIKE|list_status|ts_stock_basic/);
  });

  it.each([
    { ...input, period: 'lifetime' }, { ...input, period: '30; DROP TABLE ts_daily' },
    { ...input, market: 'OTHER' }, { ...input, market: '__proto__' },
    { ...input, keyword: 1 }, null,
  ])('非法input在查询前拒绝：%j', async invalid => {
    const db = rawDb();
    await expect(getStockStreakComparison(db, invalid as StockStreakComparisonInput)).rejects.toThrow();
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe('90秒缓存、身份隔离、keys上界、失败可重试', () => {
  it('相同稳定db/period/market/keyword/cutoff并发去重并缓存成功结果90秒', async () => {
    const db = rawDb();
    const results = await Promise.all(Array.from({ length: 8 }, () => getStockStreakComparison(db, input)));
    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(results.every(result => result === results[0])).toBe(true);
    vi.setSystemTime(new Date('2026-11-05T07:01:00Z'));
    await getStockStreakComparison(db, input);
    expect(db.execute).toHaveBeenCalledTimes(6);
    vi.setSystemTime(new Date('2026-11-05T07:02:29.999Z'));
    await getStockStreakComparison(db, input);
    expect(db.execute).toHaveBeenCalledTimes(6);
    vi.setSystemTime(new Date('2026-11-05T07:02:30Z'));
    await getStockStreakComparison(db, input);
    expect(db.execute).toHaveBeenCalledTimes(9);
  });

  it('executor身份隔离，并以market/keyword/period独立keys，不串DB或筛选结果', async () => {
    const first = rawDb();
    const second = rawDb([{ ts_code: '000001.SZ', name: '另一DB', up_days: '0', down_days: '1' }]);
    const a = await getStockStreakComparison(first, input);
    const b = await getStockStreakComparison(second, input);
    expect(a.up[0].tsCode).toBe('600001.SH');
    expect(b.up).toEqual([]);
    expect(b.down[0].name).toBe('另一DB');
    for (const changed of [{ ...input, market: 'SH' as const }, { ...input, keyword: 'x' }, { ...input, period: '60' as const }]) {
      await getStockStreakComparison(first, changed);
    }
    expect(first.execute).toHaveBeenCalledTimes(12);
    expect(second.execute).toHaveBeenCalledTimes(3);
  });

  it('缓存最多12keys，touch为LRU，满额淘汰最早未触碰key', async () => {
    const db = rawDb([], []);
    for (let i = 0; i < 12; i++) await getStockStreakComparison(db, { ...input, keyword: `key${i}` });
    await getStockStreakComparison(db, { ...input, keyword: 'key0' });
    expect(db.execute).toHaveBeenCalledTimes(12);
    await getStockStreakComparison(db, { ...input, keyword: 'key12' });
    await getStockStreakComparison(db, { ...input, keyword: 'key0' });
    expect(db.execute).toHaveBeenCalledTimes(13);
    await getStockStreakComparison(db, { ...input, keyword: 'key1' });
    expect(db.execute).toHaveBeenCalledTimes(14);
  });

  it('12个inflight键上界：第13个不同请求等待，重复key合并；放行后均完成', async () => {
    const releases: (() => void)[] = [];
    let active = 0, maxActive = 0;
    const execute = vi.fn(async (_sql: string, _params?: any[]): Promise<unknown> => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>(resolve => { releases.push(resolve); });
      active--;
      return [[], []];
    });
    const db = { execute };
    const requests = Array.from({ length: 13 }, (_, i) => getStockStreakComparison(db, { ...input, keyword: `key${i}` }));
    const duplicate = getStockStreakComparison(db, { ...input, keyword: 'key0' });
    expect(execute).toHaveBeenCalledTimes(12);
    releases.shift()!();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(13);
    while (releases.length) releases.shift()!();
    const results = await Promise.all([...requests, duplicate]);
    expect(maxActive).toBe(12);
    expect(results[0]).toBe(results[13]);
  });

  it('调用方等待并发名额期间修改input，不改变既定key/查询参数', async () => {
    const releases: (() => void)[] = [];
    const db: StockComparisonDb = { execute: vi.fn(async (sql: string, _params?: any[]) => {
      if (sql.includes('AS data_updated_at')) return [[{ data_updated_at: null }], []];
      if (sql.includes('SELECT DISTINCT')) {
        await new Promise<void>(resolve => releases.push(resolve));
        return [[{ trade_date: '20261104' }], []];
      }
      return [[], []];
    }) };
    const requests = Array.from({ length: 12 }, (_, i) => getStockStreakComparison(db, { ...input, keyword: `key${i}` }));
    const mutable: StockStreakComparisonInput = { ...input, keyword: 'original' };
    const waiting = getStockStreakComparison(db, mutable);
    mutable.keyword = 'mutated';
    mutable.market = 'DELISTED';
    releases.shift()!();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    while (releases.length) releases.shift()!();
    await Promise.all([...requests, waiting]);
    const calls = vi.mocked(db.execute).mock.calls;
    const original = calls.find(([, params]) => params?.[3] === '%original%');
    expect(original?.[1]).toEqual(['20261104', '20261104', 'L', '%original%', '%original%']);
    expect(calls.some(([, params]) => params?.includes('%mutated%'))).toBe(false);
  });

  it('SELECT失败不缓存伪空结果，清理inflight并允许重试', async () => {
    const db = rawDb();
    db.execute.mockRejectedValueOnce(new Error('read failed'));
    await expect(getStockStreakComparison(db, input)).rejects.toThrow('read failed');
    expect((await getStockStreakComparison(db, input)).up).toHaveLength(1);
    expect(db.execute).toHaveBeenCalledTimes(4);
  });

  it('不同等待key不继承满额队列中某个SELECT的失败', async () => {
    const rejectors: ((reason: Error) => void)[] = [];
    let started = 0;
    const db: StockComparisonDb = { execute: async () => {
      if (++started > 12) return [[], []];
      return new Promise((_resolve, reject) => rejectors.push(reject));
    } };
    const first = Array.from({ length: 12 }, (_, i) => getStockStreakComparison(db, { ...input, keyword: `key${i}` })
      .then(() => 'unexpected', error => error.message));
    const waiting = getStockStreakComparison(db, { ...input, keyword: 'waiting' });
    rejectors.forEach(reject => reject(new Error('isolated failure')));
    expect((await waiting).windowTradingDays).toBe(0);
    expect(await Promise.all(first)).toEqual(Array(12).fill('isolated failure'));
  });

  it.each([['20261105'], ['20260229'], [''], ['20261104', '20261104'], ['20261103', '20261104'], Array(31).fill('20261104')].map(dates => [dates]))
   ('非法/未来/重复/失序/超长窗口拒绝：%j', async tradeDates => {
      const db = rawDb([], tradeDates);
      await expect(getStockStreakComparison(db, input)).rejects.toThrow(TypeError);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

  it.each([null, '', 'NaN', -1, 1.5, Infinity, '2'])('非法/超过窗口计数%s拒绝且失败不缓存', async days => {
    const db = rawDb([{ ts_code: '600001.SH', name: '样本', up_days: days, down_days: '0' }]);
    await expect(getStockStreakComparison(db, input)).rejects.toThrow(TypeError);
    await expect(getStockStreakComparison(db, input)).rejects.toThrow(TypeError);
    expect(db.execute).toHaveBeenCalledTimes(4);
  });

  it('错误execute结果或身份错误明确失败，不默认为0', async () => {
    for (const result of [undefined, { rows: [] }, [null, []]]) {
      await expect(getStockStreakComparison({ execute: async () => result }, input)).rejects.toThrow(TypeError);
    }
    for (const rows of [
      [{ ts_code: '', name: '样本', up_days: 1, down_days: 0 }],
      [{ ts_code: '600001.SH', name: null, up_days: 1, down_days: 0 }],
      Array(2).fill({ ts_code: '600001.SH', name: '样本', up_days: 1, down_days: 0 }),
    ]) await expect(getStockStreakComparison(rawDb(rows), input)).rejects.toThrow(TypeError);
  });

  it('接受mysql2 [rows,fields]及直接rows数组的稳定adapter', async () => {
    expect((await getStockStreakComparison(rawDb(undefined, undefined, true), input)).up[0].days).toBe(1);
    const db: StockComparisonDb = { execute: async sql => sql.includes('AS data_updated_at')
      ? [[{ data_updated_at: null }]] : sql.includes('SELECT DISTINCT')
        ? [[{ trade_date: '20261104' }]] : [[{ ts_code: '600001.SH', name: '样本', up_days: 1n, down_days: 0n }]] };
    expect((await getStockStreakComparison(db, input)).up[0].days).toBe(1);
  });
});
