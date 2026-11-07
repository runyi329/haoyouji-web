import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStockLatestQuotes, type StockLatestQuotesDb } from './stock-latest-quotes';

// Only injected execute/fetch mocks: no routers, DB connections, collectors or
// scheduler imports. Fixtures must never reach the real network or production DB.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T02:00:00Z')); // Friday Beijing 10:00
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected real fetch'); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

const SZ = '000001.SZ', SH = '600000.SH', BJ = '830001.BJ';
const nowAt = (wallTime = '2026-11-06 10:00:00') => new Date(wallTime.replace(' ', 'T') + '+08:00');
type Daily = { ts_code: string; trade_date: unknown; close: unknown; pct_chg: unknown; change: unknown };
function daily(ts_code = SZ, trade_date: unknown = '20261105', overrides: Partial<Daily> = {}): Daily {
  return { ts_code, trade_date, close: '10.20', pct_chg: '-2.8571', change: '-0.30', ...overrides };
}
function dbFixture(codes = [SZ], dailyRows: Daily[] = [], statuses: Record<string, string> = {}, direct = false) {
  const execute = vi.fn(async (sql: string, params: any[] = []): Promise<unknown> => {
    // Make writes fail rather than silently accepting them in a mock.
    if (!/^\s*SELECT\s/i.test(sql)) throw new Error('DB write forbidden');
    let rows: Record<string, unknown>[];
    if (sql.includes('FROM ts_stock_basic WHERE')) {
      rows = codes.filter(code => params.includes(code)).map(ts_code => ({ ts_code, list_status: statuses[ts_code] ?? 'L' }));
    } else if (sql.includes('STRAIGHT_JOIN ts_daily AS d')) {
      expect(sql).toContain('d.chg AS `change`');
      const requested = params.slice(1), cutoff = params[0];
      rows = requested.flatMap(code => dailyRows.filter(row => row.ts_code === code
        && typeof row.trade_date === 'string' && row.trade_date <= cutoff)
        .sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date))).slice(0, 1));
    } else throw new Error('Unexpected SQL');
    return direct ? rows : [rows, []];
  });
  return { execute };
}
function line(code = SZ, overrides: Record<number, string> = {}, symbolOverride?: string) {
  const fields: string[] = Array(33).fill('');
  fields[0] = '51'; fields[1] = '__GBK__'; fields[2] = code.slice(0, 6);
  fields[3] = '10.80'; fields[4] = '10.50'; fields[30] = '20261106095930'; fields[31] = '0.30'; fields[32] = '2.8571';
  for (const [index, value] of Object.entries(overrides)) fields[Number(index)] = value;
  const symbol = symbolOverride ?? code.slice(7).toLowerCase() + code.slice(0, 6);
  return `v_${symbol}="${fields.join('~')}";`;
}
function gbkResponse(text: string, status = 200) {
  // GBK bytes C6 BD B0 B2 = 平安; a UTF-8/fatal decoder would reject this.
  const chunks = text.split('__GBK__').flatMap((part, i) => i === 0 ? [Buffer.from(part)]
    : [Buffer.from([0xc6, 0xbd, 0xb0, 0xb2]), Buffer.from(part)]);
  return new Response(new Uint8Array(Buffer.concat(chunks)), { status });
}
function fetchFixture(text: string | (() => string), status = 200) {
  return vi.fn<typeof fetch>(async () => gbkResponse(typeof text === 'function' ? text() : text, status));
}
async function getOne(fields: Record<number, string> = {}, wallTime?: string, rows: Daily[] = []) {
  const db = dbFixture([SZ], rows), fetchImpl = fetchFixture(line(SZ, fields));
  const result = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt(wallTime) });
  return { item: result.items[0], result, db, fetchImpl };
}

describe('输入、来源与只读边界', () => {
  it.each(['000001.sz', '1.SZ', '000001.HK', '000001.SH?x', 'sh000001', ' 000001.SZ', '000001.SZ\n', '000001.SZ,sh600000'])
    ('拒绝非法代码 %s 且不发生I/O', async code => {
      const db = dbFixture(), fetchImpl = fetchFixture('');
      await expect(getStockLatestQuotes(db, { tsCodes: [code] }, { fetchImpl })).rejects.toThrow(TypeError);
      expect(db.execute).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
    });
  it.each([null, {}, { tsCodes: null }, { tsCodes: '000001.SZ' }, { tsCodes: [null] }, { tsCodes: [123456] }])
    ('拒绝非数组/非字符串输入 %#', async input => {
      const db = dbFixture();
      await expect(getStockLatestQuotes(db, input as any)).rejects.toThrow(TypeError);
      expect(db.execute).not.toHaveBeenCalled();
    });
  it('原始数组最多200；空数组无IO；无效now拒绝', async () => {
    const db = dbFixture(), fetchImpl = fetchFixture('');
    await expect(getStockLatestQuotes(db, { tsCodes: Array(201).fill(SZ) }, { fetchImpl })).rejects.toThrow(TypeError);
    await expect(getStockLatestQuotes(db, { tsCodes: Array(1) }, { fetchImpl })).rejects.toThrow(TypeError);
    await expect(getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: new Date(NaN) })).rejects.toThrow(RangeError);
    expect(await getStockLatestQuotes(db, { tsCodes: [] }, { fetchImpl, now: nowAt() }))
      .toEqual({ items: [], fetchedAt: '2026-11-06T02:00:00.000Z' });
    expect(db.execute).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('按首现次序去重，并生成真实腾讯SH/SZ/BJ批量地址', async () => {
    const db = dbFixture([SZ, SH, BJ]);
    const fetchImpl = fetchFixture([line(SH), line(BJ), line(SZ)].join(''));
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ, SH, SZ, BJ] }, { fetchImpl, now: nowAt() });
    expect(result.items.map(item => item.tsCode)).toEqual([SZ, SH, BJ]);
    expect(result.items.every(item => item.source === 'tencent')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://qt.gtimg.cn/q=sz000001,sh600000,bj830001');
    expect(db.execute.mock.calls[0][1]).toEqual([SZ, SH, BJ]);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
  it('不存在/退市/暂停上市代码只读日线，先查状态且D绝不出网', async () => {
    const absent = '600001.SH';
    const db = dbFixture([SZ, SH, BJ], [daily(SZ), daily(SH, '20200102'), daily(BJ)], { [SH]: 'D', [BJ]: 'P' });
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      expect(db.execute.mock.calls[0][0]).toContain('FROM ts_stock_basic');
      return gbkResponse(line(SZ));
    });
    const result = await getStockLatestQuotes(db, { tsCodes: [SH, SZ, BJ, absent] }, { fetchImpl, now: nowAt() });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://qt.gtimg.cn/q=sz000001');
    expect(result.items.map(item => [item.source, item.status])).toEqual([
      ['daily', 'stale'], ['tencent', 'live'], ['daily', 'close'], ['unavailable', 'unavailable'],
    ]);
    expect(db.execute.mock.calls[1][1]).toEqual(['20261105', SH, BJ, absent]);
    for (const [sql] of db.execute.mock.calls) expect(sql.trim()).toMatch(/^SELECT\s/i);
  });
  it('已缓存L腾讯报价也不能盖过之后的D状态/代码复用', async () => {
    const statuses = { [SZ]: 'L' };
    const db = dbFixture([SZ], [daily(SZ, '20200102')], statuses), fetchImpl = fetchFixture(line());
    await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    statuses[SZ] = 'D';
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.items[0]).toMatchObject({ source: 'daily', status: 'stale', tradeDate: '2020-01-02' });
  });
  it('模块没有运行时import，不能引入DB/采集/调度副作用', () => {
    const source = readFileSync(new URL('./stock-latest-quotes.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|REPLACE|TRUNCATE)\s+(?:INTO|TABLE|FROM)\b/i);
  });
});

describe('腾讯GBK与严格字段解析', () => {
  it('arrayBuffer + GBK解码，官方北京时间原样保留，涨红/跌绿符号不颠倒', async () => {
    const decode = vi.spyOn(TextDecoder.prototype, 'decode');
    const db = dbFixture([SZ, SH]);
    const response = gbkResponse(line(SZ) + '\n' + line(SH, { 3: '10.20', 31: '-0.30', 32: '-2.8571' }));
    const textSpy = vi.spyOn(response, 'text');
    const arraySpy = vi.spyOn(response, 'arrayBuffer');
    const fetchImpl = vi.fn<typeof fetch>(async () => response);
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ, SH] }, { fetchImpl, now: nowAt() });
    expect(result.items).toEqual([
      { tsCode: SZ, price: 10.8, change: 0.3, changePercent: 2.8571, tradeDate: '2026-11-06',
        quoteTime: '2026-11-06 09:59:30', source: 'tencent', status: 'live' },
      { tsCode: SH, price: 10.2, change: -0.3, changePercent: -2.8571, tradeDate: '2026-11-06',
        quoteTime: '2026-11-06 09:59:30', source: 'tencent', status: 'live' },
    ]);
    expect(textSpy).not.toHaveBeenCalled(); expect(arraySpy).toHaveBeenCalledTimes(1);
    expect(decode.mock.contexts.some(instance => (instance as unknown as TextDecoder).encoding === 'gbk')).toBe(true);
  });
  it('兼容预览注入的最小ok/status/arrayBuffer响应', async () => {
    const response = gbkResponse(line());
    const fetchImpl = vi.fn<typeof fetch>(async () => ({ ok: true, status: 200,
      arrayBuffer: () => response.arrayBuffer() }) as unknown as Response);
    const result = await getStockLatestQuotes(dbFixture(), { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    expect(result.items[0]).toMatchObject({ source: 'tencent', status: 'live', tradeDate: '2026-11-06' });
  });
  it.each(['', ' ', 'NaN', 'Infinity', '-Infinity', '10abc', '0x10', '1e1', '10\n'])
    ('拒绝腾讯非严格十进制字段 %s', async value => {
      for (const index of [3, 31, 32]) {
        const { item } = await getOne({ [index]: value });
        expect(item.source).toBe('unavailable'); expect(item.price).toBeNull();
      }
    });
  it.each(['0', '-0', '-1'])('当前价%s不能用[4]昨收伪报实时', async price => {
    const { item } = await getOne({ 3: price, 4: '99.99' }, undefined, [daily()]);
    expect(item).toMatchObject({ price: 10.2, source: 'daily', status: 'close', quoteTime: null, tradeDate: '2026-11-05' });
  });
  it('零涨跌是合法平盘而非缺失', async () => {
    expect((await getOne({ 31: '0', 32: '0' })).item).toMatchObject({ source: 'tencent', change: 0, changePercent: 0 });
  });
  it.each(['', '20261106', '202611060959', '202611060959300', '2026110609593a', '20260229095930',
    '20260230095930', '20261301095930', '20260001095930', '20261100095930', '20261106240000',
    '20261106096000', '20261106095960', '00001106095930', '20261106100101'])
    ('拒绝缺失/溢出/非真实/超过60秒未来官方时间 %s', async timestamp => {
      const { item } = await getOne({ 30: timestamp }, undefined, [daily()]);
      expect(item).toMatchObject({ source: 'daily', tradeDate: '2026-11-05', quoteTime: null });
    });
  it('接受真实闰日但明确旧日stale，不显示为今日', async () => {
    expect((await getOne({ 30: '20240229150000' })).item).toMatchObject({ source: 'tencent',
      status: 'stale', tradeDate: '2024-02-29', quoteTime: '2024-02-29 15:00:00' });
  });
  it('未来容忍60秒内可保留，但绝不是live', async () => {
    expect((await getOne({ 30: '20261106100100' })).item.status).toBe('delayed');
  });
  it.each([line(SZ, {}, 'sh000001'), line(SH), line(SZ, { 2: '600000' }), `junk${line(SZ)}`,
    'v_sz000001="";', line(SZ).replace(/;$/, '')])
    ('不匹配交易所symbol/字段代码/记录格式不得使用 %#', async text => {
      const result = await getStockLatestQuotes(dbFixture(), { tsCodes: [SZ] }, { fetchImpl: fetchFixture(text), now: nowAt() });
      expect(result.items[0].source).toBe('unavailable');
    });
  it('非法GBK字节不能当正常腾讯响应', async () => {
    const text = line().replace('__GBK__', '');
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(Buffer.concat([
      Buffer.from(text.slice(0, 20)), Buffer.from([0xff]), Buffer.from(text.slice(20)),
    ]))));
    const result = await getStockLatestQuotes(dbFixture([SZ], [daily()]), { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    expect(result.items[0].source).toBe('daily');
  });
});

describe('北京时间实时/延迟/收盘/陈旧口径', () => {
  it('正常请求结束后判断live，腾讯timestamp可在请求开始后几秒更新', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      vi.setSystemTime(new Date('2026-11-06T02:00:05Z'));
      return gbkResponse(line(SZ, { 30: '20261106100005' }));
    });
    const result = await getStockLatestQuotes(dbFixture(), { tsCodes: [SZ] }, { fetchImpl });
    expect(result.items[0]).toMatchObject({ source: 'tencent', status: 'live', quoteTime: '2026-11-06 10:00:05' });
    expect(result.fetchedAt).toBe('2026-11-06T02:00:05.000Z');
  });
  it.each([
    ['2026-11-06 09:29:59', '20261106092959', 'close'],
    ['2026-11-06 09:30:00', '20261106093000', 'live'],
    ['2026-11-06 10:00:00', '20261106095800', 'live'],
    ['2026-11-06 10:00:00', '20261106095759', 'delayed'],
    ['2026-11-06 09:30:00', '20261106092959', 'delayed'],
    ['2026-11-06 11:30:00', '20261106113000', 'live'],
    ['2026-11-06 11:30:01', '20261106113000', 'close'],
    ['2026-11-06 12:00:00', '20261106113000', 'close'],
    ['2026-11-06 13:00:00', '20261106113000', 'delayed'],
    ['2026-11-06 13:00:00', '20261106130000', 'live'],
    ['2026-11-06 15:00:00', '20261106150000', 'live'],
    ['2026-11-06 15:00:01', '20261106150000', 'close'],
    ['2026-11-07 10:00:00', '20261107100000', 'close'],
    ['2026-11-08 10:00:00', '20261106150000', 'close'],
    ['2026-11-06 10:00:00', '20261105150000', 'close'],
    ['2026-11-06 16:00:00', '20261105150000', 'stale'],
    ['2026-11-06 10:00:00', '20261030150000', 'stale'],
    ['2026-11-09 10:00:00', '20261106150000', 'close'],
  ])('%s / 源%s => %s', async (now, timestamp, status) => {
    const { item } = await getOne({ 30: timestamp }, now);
    expect(item.source).toBe('tencent'); expect(item.status).toBe(status);
    expect(item.tradeDate).toBe(timestamp.slice(0, 4) + '-' + timestamp.slice(4, 6) + '-' + timestamp.slice(6, 8));
  });
  it('同批旧昨收与今日报价各保留自己日期、涨跌幅，不全部标今日', async () => {
    const db = dbFixture([SZ, SH]);
    const fetchImpl = fetchFixture(line(SZ) + line(SH, { 30: '20261105150000', 32: '-4.50', 31: '-0.70' }));
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ, SH] }, { fetchImpl, now: nowAt() });
    expect(result.items[0]).toMatchObject({ status: 'live', tradeDate: '2026-11-06' });
    expect(result.items[1]).toMatchObject({ source: 'tencent', status: 'close', tradeDate: '2026-11-05',
      quoteTime: '2026-11-05 15:00:00', changePercent: -4.5, change: -0.7 });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});

describe('按缺失代码读取最新已完成日线', () => {
  it.each(['throw', 'http', 'body', 'empty'] as const)('请求%s失败时回退，不伪造报价时间', async failure => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      if (failure === 'throw') throw new Error('offline');
      if (failure === 'http') return gbkResponse(line(), 503);
      if (failure === 'body') {
        const response = gbkResponse(line());
        vi.spyOn(response, 'arrayBuffer').mockRejectedValue(new Error('broken stream'));
        return response;
      }
      return gbkResponse('');
    });
    const db = dbFixture([SZ], [daily(SZ, '20261104'), daily(SZ, '20261105'), daily(SZ, '20261106', { close: '99', pct_chg: '99' })]);
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    expect(result.items[0]).toEqual({ tsCode: SZ, price: 10.2, change: -0.3, changePercent: -2.8571,
      source: 'daily', status: 'close', tradeDate: '2026-11-05', quoteTime: null });
    const [sql, params] = db.execute.mock.calls[1];
    expect(sql).toMatch(/b\.ts_code IN \(\?\)/);
    expect(sql).toContain('STRAIGHT_JOIN ts_daily');
    expect(sql).toContain('d.chg AS `change`');
    expect(sql).toContain('MAX(latest.trade_date)');
    expect(sql).toContain('latest.ts_code = b.ts_code AND latest.trade_date <= ?');
    expect(sql.match(/FORCE INDEX \(uk_code_date\)/g)).toHaveLength(2);
    expect(sql).not.toMatch(/GROUP BY|COALESCE|NOW\(|CURDATE\(/i);
    expect(params).toEqual(['20261105', SZ]);
  });
  it.each([
    ['2026-11-06 14:59:59', '20261105', '2026-11-05'],
    ['2026-11-06 15:00:00', '20261106', '2026-11-06'],
    ['2026-11-06 15:00:01', '20261106', '2026-11-06'],
    ['2026-11-07 10:00:00', '20261106', '2026-11-06'],
  ])('%s仅查询<=%s的最新一行', async (now, cutoff, expectedDate) => {
    const db = dbFixture([SZ], [daily(SZ, '20261104'), daily(SZ, '20261105'), daily(SZ, '20261106')]);
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl: fetchFixture(''), now: nowAt(now) });
    expect(result.items[0]).toMatchObject({ source: 'daily', status: 'close', tradeDate: expectedDate, quoteTime: null });
    expect(db.execute.mock.calls[1][1]).toEqual([cutoff, SZ]);
  });
  it('只回退missings，腾讯与日线的日期/涨跌幅绝不混用', async () => {
    const db = dbFixture([SZ, SH], [daily(SZ, '20261105', { pct_chg: '99' }), daily(SH, '20261104', { pct_chg: '-3' })]);
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ, SH] }, { fetchImpl: fetchFixture(line(SZ)), now: nowAt() });
    expect(db.execute.mock.calls[1][1]).toEqual(['20261105', SH]);
    expect(result.items[0]).toMatchObject({ source: 'tencent', changePercent: 2.8571, tradeDate: '2026-11-06' });
    expect(result.items[1]).toMatchObject({ source: 'daily', changePercent: -3, tradeDate: '2026-11-04', status: 'stale' });
  });
  it.each([null, '', 'garbage', 'NaN', 'Infinity', false])('日线涨跌缺失%s保留null，不能制造0', async value => {
    const db = dbFixture([SZ], [daily(SZ, '20261105', { pct_chg: value, change: value })], {}, true);
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl: fetchFixture(''), now: nowAt() });
    expect(result.items[0]).toMatchObject({ price: 10.2, change: null, changePercent: null, source: 'daily' });
  });
  it.each([null, '', 'NaN', '0', 0, -1])('日线price%s无效则完整null unavailable', async close => {
    const result = await getStockLatestQuotes(dbFixture([SZ], [daily(SZ, '20261105', { close })]),
      { tsCodes: [SZ] }, { fetchImpl: fetchFixture(''), now: nowAt() });
    expect(result.items[0]).toEqual({ tsCode: SZ, price: null, change: null, changePercent: null,
      tradeDate: null, quoteTime: null, source: 'unavailable', status: 'unavailable' });
  });
  it.each(['20260230', '20261106', '2026-11-05', null])('防御DB返回非法/未完成日期%s', async trade_date => {
    const db: StockLatestQuotesDb = { execute: vi.fn(async sql => sql.includes('FROM ts_stock_basic WHERE')
      ? [[{ ts_code: SZ, list_status: 'L' }], []] : [[daily(SZ, trade_date)], []]) };
    const result = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl: fetchFixture(''), now: nowAt() });
    expect(result.items[0].source).toBe('unavailable');
  });
  it('DB查询失败透传，不连接/写入/伪装为实时成功', async () => {
    const fetchImpl = fetchFixture(line());
    await expect(getStockLatestQuotes({ execute: async () => { throw new Error('DB unavailable'); } },
      { tsCodes: [SZ] }, { fetchImpl })).rejects.toThrow('DB unavailable');
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(getStockLatestQuotes({ execute: async () => ({ wrong: [] }) }, { tsCodes: [SZ] }, { fetchImpl }))
      .rejects.toThrow('Unexpected latest quotes SELECT result');
  });
});

describe('有界15秒缓存、合并请求与<=80/<=3限流', () => {
  it('200代码分80/80/40且同时最多3', async () => {
    const codes = Array.from({ length: 200 }, (_, i) => `${String(i + 1).padStart(6, '0')}.SZ`);
    const db = dbFixture(codes);
    let active = 0, maximum = 0;
    const release: Array<() => void> = [];
    const fetchImpl = vi.fn<typeof fetch>(async url => {
      active++; maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => release.push(resolve));
      active--;
      const requested = String(url).split('q=')[1].split(',').map(symbol => symbol.slice(2) + '.SZ');
      return gbkResponse(requested.map(code => line(code)).join('\n'));
    });
    const promise = getStockLatestQuotes(db, { tsCodes: codes }, { fetchImpl, now: nowAt() });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    expect(fetchImpl.mock.calls.map(([url]) => String(url).split('q=')[1].split(',').length)).toEqual([80, 80, 40]);
    release.splice(0).forEach(resolve => resolve());
    expect((await promise).items).toHaveLength(200); expect(maximum).toBe(3);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
  it('跨同时调用同fetcher也是最多3，重复代码inflight合并', async () => {
    const codes = Array.from({ length: 6 }, (_, i) => `${String(i + 1).padStart(6, '0')}.SZ`);
    const db = dbFixture(codes);
    let active = 0, maximum = 0;
    const release: Array<() => void> = [];
    const fetchImpl = vi.fn<typeof fetch>(async url => {
      active++; maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => release.push(resolve));
      active--;
      return gbkResponse(line(String(url).split('q=sz')[1] + '.SZ'));
    });
    const calls = [...codes, codes[0]].map(code => getStockLatestQuotes(db, { tsCodes: [code] }, { fetchImpl, now: nowAt() }));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    release.splice(0).forEach(resolve => resolve());
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(6));
    release.splice(0).forEach(resolve => resolve());
    const results = await Promise.all(calls);
    expect(maximum).toBe(3); expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(results.every(result => result.items[0].source === 'tencent')).toBe(true);
  });
  it('15秒内复用，15秒边界重取；quoteTime不改，请求now重新判断实时状态', async () => {
    const db = dbFixture(), fetchImpl = fetchFixture(line(SZ, { 30: '20261106100000' }));
    const first = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    vi.setSystemTime(new Date(Date.now() + 14_999));
    const second = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt('2026-11-06 10:02:01') });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.items[0].status).toBe('live'); expect(second.items[0].status).toBe('delayed');
    expect(second.items[0].quoteTime).toBe('2026-11-06 10:00:00');
    expect(second.fetchedAt).toBe('2026-11-06T02:02:01.000Z');
    vi.setSystemTime(new Date(Date.now() + 1));
    await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledTimes(3); // Listing status is never cached.
  });
  it('缓存不跨fetchImpl；未来有效性在缓存命中时重新校验', async () => {
    const db = dbFixture([SZ], [daily()]);
    const a = fetchFixture(line()), b = fetchFixture(line(SZ, { 3: '20' }));
    await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl: a, now: nowAt() });
    expect((await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl: b, now: nowAt() })).items[0].price).toBe(20);
    expect((await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl: a, now: nowAt('2026-11-06 09:58:00') }))
      .items[0].source).toBe('daily');
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
  });
  it('失败也短暂合并，日线不缓存；15秒后恢复腾讯', async () => {
    const db = dbFixture([SZ], [daily()]);
    let body = '';
    const fetchImpl = fetchFixture(() => body);
    const one = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    body = line();
    const two = await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt() });
    expect(one.items[0].source).toBe('daily'); expect(two.items[0].source).toBe('daily');
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(db.execute).toHaveBeenCalledTimes(4);
    vi.setSystemTime(new Date(Date.now() + 15_000));
    expect((await getStockLatestQuotes(db, { tsCodes: [SZ] }, { fetchImpl, now: nowAt() })).items[0].source).toBe('tencent');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('缓存最多200个code；溢出淘汰旧code而不是无限请求组合键', async () => {
    const codes = Array.from({ length: 201 }, (_, i) => `${String(i + 1).padStart(6, '0')}.SZ`);
    const db = dbFixture(codes);
    const fetchImpl = vi.fn<typeof fetch>(async url => gbkResponse(String(url).split('q=')[1].split(',')
      .map(symbol => line(symbol.slice(2) + '.SZ')).join('\n')));
    await getStockLatestQuotes(db, { tsCodes: codes.slice(0, 200) }, { fetchImpl, now: nowAt() });
    await getStockLatestQuotes(db, { tsCodes: codes.slice(200) }, { fetchImpl, now: nowAt() });
    await getStockLatestQuotes(db, { tsCodes: [codes[0]] }, { fetchImpl, now: nowAt() });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls[4][0]).toBe('https://qt.gtimg.cn/q=sz000001');
  });
});
