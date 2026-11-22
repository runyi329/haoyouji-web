import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { readFunderEvidenceNumber } from './shared/funder-settlement-evidence';

// Execute the actual production bodies only. No database/router initialization or live API requests.
const source = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('routers.ts', source, ts.ScriptTarget.Latest, true);
function actual(name: string, deps: Record<string, any>) {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing production function: ${name}`);
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(deps), `${code}; return ${name};`)(...Object.values(deps));
}
const instrumentName = 'ETH-25JUN27-1700-C';
const input = (patch: any = {}) => ({ currency: 'ETH', instrumentName, gateSymbol: 'ETH_USDT-20270625-1700-C', cacheKey: `greeks:${instrumentName}`, cached: null, ...patch });
const book = (patch: any = {}) => ({ result: { instrument_name: instrumentName, mark_price: 0.1887, index_price: 1659.98, timestamp: 1795317933142, greeks: { delta: 0.67, gamma: null, theta: -0.5, vega: 0 }, mark_iv: 65, ...patch } });
function refresher(patch: Record<string, any> = {}) {
  const write = vi.fn(async () => undefined);
  const gate = vi.fn(async () => { throw new Error('Gate.io 未找到合约'); });
  const deribit = vi.fn(async () => book());
  const inFlight = new Map();
  const run = actual('refreshOptionGreeksQuote', { readFunderEvidenceNumber,
    hasUsableOptionMarkPrice: (v: any) => { const n = readFunderEvidenceNumber(v); return n !== null && n > 0; },
    getGateOptionTicker: gate, getDeribitOptionOrderBook: deribit, deribitDbSet: write,
    optionGreeksQuoteRefreshes: inFlight, ...patch });
  return { run, write, gate, deribit, inFlight };
}
afterEach(() => vi.restoreAllMocks());

describe('真实期权路由：Gate主源和六月Deribit备用', () => {
  it('六月Gate无合约，备用读取同一合约并保留原币乘指数及真实时间', async () => {
    const r = refresher(); const start = Date.now(); const q = await r.run(input());
    expect(r.deribit).toHaveBeenCalledWith(instrumentName);
    expect(q).toMatchObject({ instrumentName, source: 'deribit', markPrice: 0.1887 * 1659.98, indexPrice: 1659.98, delta: 0.67, gamma: null, theta: -0.5, vega: 0, quoteTimestamp: 1795317933142, fromCache: false });
    expect(q.fetchedAt).toBeGreaterThanOrEqual(start);
    expect(r.write).toHaveBeenCalledWith(`greeks:${instrumentName}`, expect.objectContaining({ markPrice: q.markPrice, fetchedAt: q.fetchedAt }));
  });
  it('Gate三月报价成功，不访问或转换Deribit备用价', async () => {
    const gate = vi.fn(async () => ({ mark_price: 128.16, index_price: 1665.58, delta: 0.5 }));
    const r = refresher({ getGateOptionTicker: gate });
    const q = await r.run(input({ instrumentName: 'ETH-26MAR27-2000-C', gateSymbol: 'ETH_USDT-20270326-2000-C' }));
    expect(q).toMatchObject({ source: 'gateio', markPrice: 128.16, indexPrice: 1665.58 });
    expect(r.deribit).not.toHaveBeenCalled();
  });
  it.each(['ETH-25JUN27-1700-P', 'ETH-25JUN27-1800-C', 'ETH-26MAR27-1700-C', 'BTC-25JUN27-1700-C', null])('错合约 %j 有报价也拒绝写缓存', async wrong => {
    const r = refresher({ getDeribitOptionOrderBook: async () => book({ instrument_name: wrong }) });
    expect(await r.run(input())).toMatchObject({ markPrice: null, error: expect.stringContaining('身份不匹配') });
    expect(r.write).not.toHaveBeenCalled();
  });
  it.each([null, undefined, '', ' ', false, true, [], {}, NaN, Infinity, -1, '-1'])('缺失/非法原币mark %j 不冒充零或现货价', async mark => {
    const r = refresher({ getDeribitOptionOrderBook: async () => book({ mark_price: mark }) });
    expect(await r.run(input())).toMatchObject({ markPrice: null }); expect(r.write).not.toHaveBeenCalled();
  });
  it.each([null, undefined, '', false, NaN, Infinity, 0, -1])('缺失/非法指数 %j 不把ETH原币mark标作USDT', async index => {
    const r = refresher({ getDeribitOptionOrderBook: async () => book({ index_price: index }) });
    expect(await r.run(input())).toMatchObject({ markPrice: null }); expect(r.write).not.toHaveBeenCalled();
  });
  it('上次有效缓存只原样回退，不将旧时间刷新为现在', async () => {
    const r = refresher({ getDeribitOptionOrderBook: async () => { throw new Error('network unavailable'); } });
    const cached = { data: { instrumentName, source: 'deribit', markPrice: 300, fetchedAt: 1 }, fetchedAt: 123456 };
    expect(await r.run(input({ cached }))).toMatchObject({ markPrice: 300, fetchedAt: 123456, fromCache: true, cacheStale: true });
    expect(r.write).not.toHaveBeenCalled(); expect(cached.data.fetchedAt).toBe(1);
  });
  it('缺价缓存/无缓存即便指数存在也返回null，失败锁释放后可以重试', async () => {
    const deribit = vi.fn(async () => { throw new Error('network unavailable'); });
    const r = refresher({ getDeribitOptionOrderBook: deribit });
    for (const cached of [null, { data: { markPrice: 0 }, fetchedAt: 1 }, { data: { markPrice: null }, fetchedAt: 1 }]) {
      expect(await r.run(input({ cached }))).toMatchObject({ markPrice: null, fromCache: false });
      expect(r.inFlight.size).toBe(0);
    }
    expect(deribit).toHaveBeenCalledTimes(3); expect(r.write).not.toHaveBeenCalled();
  });
  it('同一合约同用途并发只取一次备用，不重复写缓存', async () => {
    let resolve!: (value: any) => void;
    const deribit = vi.fn(() => new Promise(r => { resolve = r; }));
    const r = refresher({ getDeribitOptionOrderBook: deribit });
    const a = r.run(input()); const b = r.run(input());
    await Promise.resolve(); expect(deribit).toHaveBeenCalledTimes(1);
    resolve(book()); expect(await a).toEqual(await b);
    expect(r.write).toHaveBeenCalledTimes(1); expect(r.inFlight.size).toBe(0);
  });
  it('活跃与结算用途不共用零价结果，真实结算0继续允许', async () => {
    const deribit = vi.fn(async () => book({ mark_price: 0 }));
    const r = refresher({ getDeribitOptionOrderBook: deribit });
    const [live, settlement] = await Promise.all([r.run(input()), r.run(input({ settlementEvidence: true }))]);
    expect(live.markPrice).toBeNull(); expect(settlement.markPrice).toBe(0);
    expect(deribit).toHaveBeenCalledTimes(2); expect(r.write).toHaveBeenCalledTimes(1);
  });
  it('不同合约并发不能共享结果', async () => {
    const other = 'ETH-25JUN27-1800-C';
    const deribit = vi.fn(async (name: string) => book({ instrument_name: name }));
    const r = refresher({ getDeribitOptionOrderBook: deribit });
    const [a, b] = await Promise.all([r.run(input()), r.run(input({ instrumentName: other, cacheKey: `greeks:${other}` }))]);
    expect(a.instrumentName).toBe(instrumentName); expect(b.instrumentName).toBe(other); expect(deribit).toHaveBeenCalledTimes(2);
  });
});

const catalog = () => ({ result: [
  { instrument_name: instrumentName, kind: 'option', expiration_timestamp: Date.parse('2027-06-25T08:00:00Z'), strike: 1700 },
  { instrument_name: 'ETH-25JUN27-1800-P', kind: 'option', expiration_timestamp: Date.parse('2027-06-25T08:00:00Z'), strike: 1800 },
] });
function catalogs(value: any) {
  const write = vi.fn(async () => undefined);
  const read = actual('readValidDeribitOptionCatalog', { readFunderEvidenceNumber });
  const deps = { getDeribitOptionInstruments: vi.fn(async () => value), readValidDeribitOptionCatalog: read,
    deribitDbSet: write, DERIBIT_MONTHS: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'], console: { log: vi.fn(), error: vi.fn() } };
  return { write, expiry: actual('fetchAndCacheDeribitExpiries', deps), strike: actual('fetchAndCacheDeribitStrikes', deps) };
}
describe('目录使用同一传输通路，异常不覆盖昨日有效目录', () => {
  it('官方六月到期日与1700/1800行权价按币种正确生成', async () => {
    const r = catalogs(catalog()); await r.expiry('ETH'); await r.strike('ETH');
    expect(r.write).toHaveBeenCalledWith('expiries:ETH', [expect.objectContaining({ dateStr: '2027-06-25', deribitLabel: '25JUN27' })]);
    expect(r.write).toHaveBeenCalledWith('strikes:ETH:25JUN27', [1700, 1800]);
  });
  it.each([{ error: { message: 'unavailable' } }, {}, { result: null }, { result: [] }, { result: [{ instrument_name: 'BTC-25JUN27-1700-C', kind: 'option', expiration_timestamp: 1813910400000, strike: 1700 }] }, { result: [{ instrument_name: instrumentName, kind: 'future', expiration_timestamp: 1813910400000, strike: 1700 }] }, { result: [{ instrument_name: instrumentName, kind: 'option', expiration_timestamp: null, strike: 1700 }] }, { result: [{ instrument_name: instrumentName, kind: 'option', expiration_timestamp: 1813910400000, strike: null }] }])('异常目录 %j 不写入', async value => {
    const r = catalogs(value); await r.expiry('ETH'); await r.strike('ETH'); expect(r.write).not.toHaveBeenCalled();
  });
});

function quoteQuery(deps: Record<string, any>) {
  let callback: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'deribitGetGreeks') {
      const call = node.initializer as ts.CallExpression; callback = call.arguments[0];
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); if (!callback) throw new Error('Missing actual Greeks query');
  const code = ts.transpileModule(`const run = ${callback.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(deps), `${code}; return run;`)(...Object.values(deps));
}
describe('真实查询缓存时间，不将旧价伪装成实时行情', () => {
  const payload = { currency: 'ETH', exerciseDate: '2027-06-25', strikePrice: 1700, direction: 'long_call' };
  const run = (cached: any) => {
    const refresh = vi.fn(async () => ({ instrumentName, markPrice: 301, fromCache: false }));
    return { refresh, query: quoteQuery({ TRPCError, normalizeOptionExerciseDateInBeijing: (x: string) => x,
      OPTION_QUOTE_REFRESH_MS: 3000, deribitDbGet: async () => cached, refreshOptionGreeksQuote: refresh,
      hasUsableOptionMarkPrice: (x: any) => typeof x === 'number' && x > 0 }) };
  };
  it('新鲜同合约缓存无需请求，返回真实缓存时间', async () => {
    const fetchedAt = Date.now(); const r = run({ data: { instrumentName, markPrice: 300 }, fetchedAt });
    expect(await r.query({ input: payload })).toMatchObject({ fetchedAt, fromCache: true, cacheStale: false }); expect(r.refresh).not.toHaveBeenCalled();
  });
  it('过期价先返回并后台刷新，不能把旧时间改成现在', async () => {
    const r = run({ data: { instrumentName, markPrice: 300 }, fetchedAt: 123 });
    expect(await r.query({ input: payload })).toMatchObject({ fetchedAt: 123, cacheStale: true }); expect(r.refresh).toHaveBeenCalledTimes(1);
  });
  it('无有效价同步获取六月精确合约，不跨币种/日期/行权价', async () => {
    const r = run(null); await r.query({ input: payload });
    expect(r.refresh).toHaveBeenCalledWith(expect.objectContaining({ currency: 'ETH', instrumentName, gateSymbol: 'ETH_USDT-20270625-1700-C', cacheKey: `greeks:${instrumentName}` }));
  });
});
