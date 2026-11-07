import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterAShareCompletedRows,
  getAShareCompletedCutoff,
  isValidAShareTradeDate,
  summarizeAShareCompletedDays,
} from '../shared/a-share-completed-days';

const originalTZ = process.env.TZ;
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('北京时间已完成交易日截止（纯函数）', () => {
  it.each([
    ['2026-11-05T06:59:59.999Z', '20261104'], // 北京14:59:59.999
    ['2026-11-05T07:00:00.000Z', '20261105'], // 北京15:00整
    ['2026-11-05T07:00:00.001Z', '20261105'],
    ['2026-11-05T15:59:59.999Z', '20261105'], // 北京23:59:59
    ['2026-11-05T16:00:00.000Z', '20261105'], // 北京次日00:00
    ['2026-11-06T06:59:59.999Z', '20261105'],
    ['2026-11-06T07:00:00.000Z', '20261106'],
    ['2025-12-31T16:00:00.000Z', '20251231'], // 北京跨年
    ['2026-01-01T07:00:00.000Z', '20260101'],
    ['2028-02-29T16:00:00.000Z', '20280229'], // 北京闰年跨月
    ['2026-02-28T16:00:00.000Z', '20260228'],
  ])('%s截止%s，不依赖服务器时区', (instant, expected) => {
    for (const tz of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
      process.env.TZ = tz;
      expect(getAShareCompletedCutoff(new Date(instant))).toBe(expected);
    }
  });

  it('默认当前时间可用，非法now明确拒绝', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T07:00:00Z'));
    expect(getAShareCompletedCutoff()).toBe('20261105');
    expect(() => getAShareCompletedCutoff(new Date(NaN))).toThrow(RangeError);
  });

  it.each(['20261105', '20280229', '19901219'])('真实日历日期%s有效', date => {
    expect(isValidAShareTradeDate(date)).toBe(true);
  });

  it.each(['', '20260229', '20261131', '20261301', '20260001', '20261100',
    '20261105junk', '2026-11-05', '2026115', '00001105', null, undefined, 20261105])(
    '空或非法日期%s不成为交易日', date => {
      expect(isValidAShareTradeDate(date)).toBe(false);
    },
  );
});

describe('只统计源实际提供的有效去重日线', () => {
  const rows = [
    { tradeDate: '20261105', pctChange: 4 },
    { tradeDate: '20261104', pctChange: -2 },
    { tradeDate: '20261104', pctChange: 9 },
    { tradeDate: '20261102', pctChange: 0 },
    { tradeDate: '20261101', pctChange: 1 },
    { tradeDate: '20261106', pctChange: 2 },
    { tradeDate: '20260229', pctChange: 3 },
    { tradeDate: '', pctChange: 3 },
    { tradeDate: null, pctChange: 3 },
  ];

  it('15前忽略当天、未来和非法行，同日只取第一行，涨跌平和累计同一口径', () => {
    const source = Object.freeze(rows.map(row => Object.freeze({ ...row })));
    expect(summarizeAShareCompletedDays(source, getAShareCompletedCutoff(new Date('2026-11-05T06:59:59Z'))))
      .toEqual({ upDays: 1, downDays: 1, flatDays: 1, totalDays: 3, upRate: '33.33',
        completedTradingDays: 3, completedThroughDate: '20261104', updatedAt: '2026-11-04' });
    expect(source).toHaveLength(rows.length);
  });

  it('15整及之后只在已发布当天行时计入，实际最新日期而不是理论日期', () => {
    for (const instant of ['2026-11-05T07:00:00Z', '2026-11-05T08:00:00Z']) {
      expect(summarizeAShareCompletedDays(rows, getAShareCompletedCutoff(new Date(instant))))
        .toMatchObject({ totalDays: 4, completedTradingDays: 4, upDays: 2,
          downDays: 1, flatDays: 1, completedThroughDate: '20261105', updatedAt: '2026-11-05' });
    }
    expect(summarizeAShareCompletedDays(rows.slice(1), '20261105'))
      .toMatchObject({ completedTradingDays: 3, completedThroughDate: '20261104', updatedAt: '2026-11-04' });
  });

  it('周末或停牌无行不会补交易日，不用自然日差/交易日历推算', () => {
    const sparse = [{ tradeDate: '20261030', pctChange: 1 }, { tradeDate: '20261102', pctChange: -1 }];
    for (const cutoff of ['20261102', '20261107', '20261108']) {
      expect(summarizeAShareCompletedDays(sparse, cutoff))
        .toMatchObject({ completedTradingDays: 2, completedThroughDate: '20261102', updatedAt: '2026-11-02' });
    }
  });

  it('成功空行可为0，空/非法/全未来行最新日期始终null', () => {
    for (const sparse of [[], [{ tradeDate: '', pctChange: 1 }], [{ tradeDate: '20261106', pctChange: 1 }]]) {
      expect(summarizeAShareCompletedDays(sparse, '20261105'))
        .toMatchObject({ completedTradingDays: 0, totalDays: 0, completedThroughDate: null, updatedAt: null });
    }
    expect(filterAShareCompletedRows(rows, row => row.tradeDate, '')).toEqual([]);
  });
});

// AST只提取生产AI路由query回调，所有依赖显式注入；绝不导入routers全站初始化或真实DB。
const source = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('routers.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function isolatedQuery(name: string): (args: { input: Record<string, unknown> }) => Promise<any> {
  let callback: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === name
      && ts.isCallExpression(node.initializer) && ts.isPropertyAccessExpression(node.initializer.expression)
      && node.initializer.expression.name.text === 'query') {
      callback = node.initializer.arguments[0];
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!callback) throw new Error(`Missing production callback: ${name}`);
  const code = ts.transpileModule(`const query = ${callback.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function('getAShareCompletedCutoff', 'isValidAShareTradeDate',
    'filterAShareCompletedRows', 'summarizeAShareCompletedDays', `${code}\nreturn query;`)(
    getAShareCompletedCutoff, isValidAShareTradeDate, filterAShareCompletedRows, summarizeAShareCompletedDays,
  );
}
const detailQuery = isolatedQuery('aiStockDetail');
const streakQuery = isolatedQuery('aiStockStreakStats');
const dailyQuery = isolatedQuery('aiStockDailyData');
const basicFields = ['ts_code', 'name', 'list_status', 'list_date', 'delist_date', 'exchange', 'industry'];
const basic = { code: 0, data: { fields: basicFields, items: [
  ['600000.SH', '测试股票', 'L', '19900101', null, 'SSE', '银行'],
] } };
function response(json: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => json };
}
function dailyResponse(items: unknown[][], fields = ['trade_date', 'pct_chg']) {
  return { code: 0, data: { fields, items } };
}
function mockTushare(history: (body: any) => unknown) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return response(body.api_name === 'stock_basic' ? basic : history(body));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T06:59:59Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('AI详情全历史契约（隔离原query，仅mock请求）', () => {
  it('全历史超过500，多个10年段同日去重、未来过滤、截止数据日期准确', async () => {
    const historical = Array.from({ length: 700 }, (_, i) => {
      const date = new Date(Date.UTC(1990, 0, 1 + i)).toISOString().slice(0, 10).replace(/-/g, '');
      return [date, 1];
    });
    const fetchMock = mockTushare(body => {
      if (body.params.start_date === '19900101') return dailyResponse(historical);
      if (body.params.start_date === '20200101') return dailyResponse([
        ['20261106', 4], ['20261105', 3], ['20261104', -2], ['20261104', 2], ['bad', 1],
      ]);
      return dailyResponse([]);
    });
    const result = await detailQuery({ input: { tsCode: '600000.SH' } });
    expect(result).toMatchObject({ completedTradingDays: 701, totalDays: 701, upDays: 700,
      downDays: 1, flatDays: 0, completedThroughDate: '20261104', updatedAt: '2026-11-04' });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
    const dailyBodies = bodies.filter(body => body.api_name === 'daily');
    expect(dailyBodies).toHaveLength(4);
    expect(dailyBodies.map(body => body.params.start_date)).toEqual(['19900101', '20000101', '20100101', '20200101']);
    expect(dailyBodies.every(body => body.fields === 'trade_date,pct_chg' && body.params.limit === 6000
      && body.params.end_date <= '20261104')).toBe(true);
  });

  it('15整计算当天仅当当天日线存在，数据未发布仍截至昨天', async () => {
    vi.setSystemTime(new Date('2026-11-05T07:00:00Z'));
    let published = false;
    mockTushare(body => dailyResponse(body.params.start_date === '20200101'
      ? [['20261104', -1], ...(published ? [['20261105', 1]] : [])] : []));
    expect(await detailQuery({ input: { tsCode: '600000.SH' } }))
      .toMatchObject({ completedTradingDays: 1, completedThroughDate: '20261104', updatedAt: '2026-11-04' });
    published = true;
    expect(await detailQuery({ input: { tsCode: '600000.SH' } }))
      .toMatchObject({ completedTradingDays: 2, completedThroughDate: '20261105', updatedAt: '2026-11-05' });
  });

  it.each(['external-code', 'missing-items', 'missing-date', 'truncated', 'throw', 'http'])('%s分段失败不得报部分或fake0全历史，保留基本档案', async failure => {
    mockTushare(body => {
      if (body.params.start_date !== '20000101') return dailyResponse([['20261104', 1]]);
      if (failure === 'external-code') return { code: -1, data: { items: [] } };
      if (failure === 'missing-items') return { code: 0, data: { fields: ['trade_date', 'pct_chg'] } };
      if (failure === 'missing-date') return dailyResponse([[1]], ['pct_chg']);
      if (failure === 'truncated') return dailyResponse(Array.from({ length: 6000 }, () => ['20000101', 1]));
      throw new Error('network error');
    });
    if (failure === 'http') {
      vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        return response(body.api_name === 'stock_basic' ? basic : dailyResponse([]), body.api_name === 'stock_basic');
      }));
    }
    expect(await detailQuery({ input: { tsCode: '600000.SH' } }))
      .toMatchObject({ name: '测试股票', completedTradingDays: null, completedThroughDate: null,
        totalDays: null, upDays: null, downDays: null, flatDays: null, upRate: null, updatedAt: null });
  });

  it('成功完整空历史为0，但取不到档案或请求失败为null', async () => {
    mockTushare(() => dailyResponse([]));
    expect(await detailQuery({ input: { tsCode: '600000.SH' } }))
      .toMatchObject({ completedTradingDays: 0, completedThroughDate: null, totalDays: 0, updatedAt: null });
    vi.stubGlobal('fetch', vi.fn(async () => response({ code: 0, data: { fields: basicFields, items: [] } })));
    expect(await detailQuery({ input: { tsCode: '600000.SH' } })).toMatchObject({ completedTradingDays: null, totalDays: null });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network error'); }));
    expect(await detailQuery({ input: { tsCode: '600000.SH' } })).toMatchObject({ completedTradingDays: null, totalDays: null });
  });
});

describe('日线与连涨跌使用同一收盘截止', () => {
  const rows = [['20261106', 1], ['20261105', 1], ['20261104', -1],
    ['20261104', 1], ['20261103', 1], ['20261102', 1], ['', 1], ['20260229', 1]];

  it.each([
    ['2026-11-05T06:59:59Z', '20261104', 3],
    ['2026-11-05T07:00:00Z', '20261105', 4],
    ['2026-11-05T09:00:00Z', '20261105', 4],
  ])('%s日线/连续统计与顶部同口径', async (instant, cutoff, count) => {
    vi.setSystemTime(new Date(instant));
    const fetchMock = mockTushare(() => dailyResponse(rows));
    const daily = await dailyQuery({ input: { tsCode: '600000.SH', limit: 500 } });
    const streak = await streakQuery({ input: { tsCode: '600000.SH' } });
    expect(daily.items).toHaveLength(count);
    expect(daily.items.map((row: any) => row.tradeDate)).toEqual(count === 3
      ? ['20261102', '20261103', '20261104'] : ['20261102', '20261103', '20261104', '20261105']);
    expect(streak).toMatchObject({ totalDays: count, maxUpStreak: 2, maxDownStreak: 1 });
    expect(streak.upStreakMap).toEqual(count === 3 ? { 2: 1 } : { 1: 1, 2: 1 });
    expect(streak.condProbTable.up[2]).toEqual({ up: 0, down: 1, flat: 0, total: 1 });
    expect(fetchMock.mock.calls.every(([, init]) => JSON.parse(String(init.body)).params.end_date === cutoff)).toBe(true);
  });

  it('连续统计第二页外部失败不能把第一页当完整累计', async () => {
    mockTushare(body => body.params.offset === 0
      ? dailyResponse(Array.from({ length: 6000 }, () => ['20261104', 1]))
      : { code: -1 });
    expect(await streakQuery({ input: { tsCode: '600000.SH' } })).toMatchObject({ totalDays: null });
  });
});
