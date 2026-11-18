import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 仅从真实源码抽取 AST 并在 VM 中执行：不 import 生产模块，不加载 DB、缓存文件或 scanner 后台。
// fetch 只绑定离线夹具；官方响应 timestamp 是观察时点，行内 ts 是滚动窗口起点。
const scanner = ts.createSourceFile('price-scanner.ts',
  readFileSync(new URL('./price-scanner.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function init(name: string): string {
  return required(nodes(scanner, ts.isVariableDeclaration).find(node => node.name.getText() === name)?.initializer, name).getText();
}
function fn(name: string): string {
  return required(nodes(scanner, ts.isFunctionDeclaration).find(node => node.name?.text === name), name)
    .getText().replace(/^export\s+/, '');
}
function evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return runInNewContext(outputText, bindings, {
    timeout: 1_000, contextCodeGeneration: { strings: false, wasm: false },
  }) as T;
}

const HOTCOIN_URL = 'https://api.hotcoinfin.com/v1/market/ticker';
const MEXC_URL = 'https://api.mexc.com/api/v3/ticker/24hr?symbol=BTYUSDT';
const HOTCOIN_SOURCE = 'Hotcoin BTY/USDT 现货';
const MEXC_SOURCE = 'MEXC BTY/USDT 现货';
const FAILURE = '未取得有效Hotcoin或MEXC BTY/USDT现货行情';
const NOW = 1_794_986_284 * 1_000;
const iso = (timestamp: number) => new Date(timestamp).toISOString();
function hotcoinRow(patch: Record<string, unknown> = {}) {
  return { symbol: 'bty_usdt', last: '0.02191', open: '0.02282', high: '0.0229', low: '0.02077',
    vol: '1960229.37', amount: '42789.19', buy: '0.02183', sell: '0.02198', change: '-3.98',
    ts: NOW - 86_400_000, ...patch };
}
function hotcoin(patch: Record<string, unknown> = {}) {
  return { status: 'ok', timestamp: NOW / 1_000, ticker: [hotcoinRow()], ...patch };
}
function mexc(patch: Record<string, unknown> = {}) {
  return { symbol: 'BTYUSDT', lastPrice: '0.02179', openPrice: '0.02286', highPrice: '0.02293',
    lowPrice: '0.02093', volume: '827643.16', quoteVolume: '18132.83354', priceChangePercent: '-0.0468',
    closeTime: NOW - 300_000, ...patch };
}
type Quote = { price: number; source: string; patch: Record<string, unknown> };
type Health = { source: string; lastSuccessAt: string; lastAttemptAt: string; consecutiveFailures: number;
  lastError?: string; ageSeconds: number; stale: boolean };
type Runtime = {
  fetchHotcoinBtySpotQuote: () => Promise<Quote | null>;
  fetchMexcBtySpotQuote: () => Promise<Quote | null>;
  fetchCryptoQuote: (coin: string) => Promise<Quote | null>;
  updateCrypto: (coin: string) => Promise<void>;
  updateCryptoFast: (coin: string) => Promise<void>;
  getLatestPrice: (coin: string) => number | null;
  getLatestChangePercent: (coin: string) => number | null;
  getLatestTickerData: (coin: string) => Record<string, unknown> | null;
  getAllLatestPrices: () => Record<string, Record<string, unknown>>;
  getRawLatestPrices: () => Record<string, Record<string, unknown>>;
  getMarketPriceHealth: () => Record<string, Health>;
  entryFromPrice: (coin: string, price: number, source: string, patch?: Record<string, unknown>) => void;
};
function response(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}
function scannerHarness(primary: unknown = hotcoin(), backup: unknown = mexc()) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const network = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === HOTCOIN_URL) return response(primary);
    if (url === MEXC_URL) return response(backup);
    throw new Error(`Unexpected offline request: ${url}`);
  });
  // 记录真实 fetchJson 的超时预算，但不启动原生 AbortSignal timer 或任何外部请求。
  const timeout = vi.fn((milliseconds: number) => ({ offlineTimeoutMs: milliseconds }));
  const variables = ['REQUEST_TIMEOUT_MS', 'CRYPTO_REQUEST_TIMEOUT_MS', 'FAST_CRYPTO_CYCLE_TIMEOUT_MS',
    'BTY_SPOT_QUOTE_MAX_AGE_MS', 'BTY_HOTCOIN_QUOTE_MAX_AGE_MS', 'CRYPTO_COINS', 'ETH_PERP_MARK_CACHE_KEY', 'KRW_COINS'];
  const functions = ['nowIso', 'isValidPrice', 'setPrice', 'markFailure', 'entryFromPrice', 'fetchJson', 'fetchCryptoJson',
    'fetchHotcoinBtySpotQuote', 'fetchMexcBtySpotQuote', 'fetchCryptoQuote', 'fetchTodayOpen', 'updateCrypto',
    'updateCryptoFast', 'isBtySpotQuoteFresh', 'getLatestPrice', 'getLatestChangePercent', 'getLatestTickerData',
    'getAllLatestPrices', 'getMarketPriceHealth'];
  const runtime = evaluate<Runtime>(`${variables.map(name => `const ${name} = ${init(name)};`).join('\n')}
    const latestPrices = {}; const priceHealth = {};
    ${functions.map(fn).join('\n')}
    ({${functions.join(',')}, getRawLatestPrices: () => ({ ...latestPrices })});`,
    { fetch: network, Date, AbortSignal: { timeout }, setTimeout, clearTimeout });
  return { runtime, network, timeout };
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function expectMexcQuote(quote: Quote | null, timestamp = NOW - 300_000) {
  expect(quote).toMatchObject({ price: 0.02179, source: MEXC_SOURCE, patch: {
    todayOpen: 0.02286, high24h: 0.02293, low24h: 0.02093, volume24h: 827643.16,
    quoteVolume24h: 18132.83354, updatedAt: iso(timestamp),
  } });
  expect(quote?.patch.changePercent).toBeCloseTo(((0.02179 - 0.02286) / 0.02286) * 100, 10);
}

describe('BTY Hotcoin 主源真实解析（AST+VM，完全离线）', () => {
  it('成功只请求一次公开Hotcoin现货；按last/open计算百分数，不信任供应商change字段', async () => {
    const { runtime, network, timeout } = scannerHarness(hotcoin({ ticker: [hotcoinRow({ change: '999999' })] }));
    const quote = await runtime.fetchCryptoQuote('BTY');
    expect(quote).toMatchObject({ price: 0.02191, source: HOTCOIN_SOURCE, patch: {
      todayOpen: 0.02282, high24h: 0.0229, low24h: 0.02077, volume24h: 1960229.37,
      quoteVolume24h: 42789.19, updatedAt: iso(NOW),
    } });
    expect(quote?.patch.changePercent).toBeCloseTo(((0.02191 - 0.02282) / 0.02282) * 100, 10);
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toBe(HOTCOIN_URL);
    expect(network.mock.calls[0][1]?.headers).toBeUndefined();
    expect(network.mock.calls[0][1]?.method).toBeUndefined(); // fetch默认GET，无账户签名。
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([7_000]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['秒', NOW / 1_000, NOW], ['毫秒', NOW, NOW],
    ['字符串秒', String(NOW / 1_000), NOW], ['字符串毫秒', String(NOW), NOW],
    ['120秒边界（秒）', (NOW - 120_000) / 1_000, NOW - 120_000],
    ['120秒边界（毫秒）', NOW - 120_000, NOW - 120_000],
  ])('归一化%s响应timestamp，保存原观察时刻', async (_label, timestamp, observedAt) => {
    const { runtime } = scannerHarness(hotcoin({ timestamp }));
    expect((await runtime.fetchHotcoinBtySpotQuote())?.patch.updatedAt).toBe(iso(Number(observedAt)));
  });

  it.each([
    ['缺日期', undefined], ['null日期', null], ['空日期', ''], ['坏日期字符串', 'not-a-date'],
    ['ISO文本不是epoch', iso(NOW)], ['零', 0], ['负数', -1], ['NaN', NaN],
    ['Infinity', Infinity], ['非safeInteger', Number.MAX_SAFE_INTEGER + 1],
    ['非整数秒', NOW / 1_000 + 0.5], ['非整数毫秒', NOW + 0.5],
    ['未来毫秒', NOW + 1], ['未来秒', NOW / 1_000 + 1],
    ['过期毫秒', NOW - 120_001], ['过期秒', (NOW - 121_000) / 1_000],
  ])('拒绝%s，不用本地时间补齐鲜度', async (_label, timestamp) => {
    const { runtime, network } = scannerHarness(hotcoin({ timestamp }));
    expect(await runtime.fetchHotcoinBtySpotQuote()).toBeNull();
    expect(runtime.getLatestPrice('BTY')).toBeNull();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['非ok状态', hotcoin({ status: 'error' })], ['大写OK', hotcoin({ status: 'OK' })],
    ['缺status', hotcoin({ status: undefined })], ['缺ticker', hotcoin({ ticker: undefined })],
    ['ticker非数组', hotcoin({ ticker: { bty_usdt: hotcoinRow() } })], ['空ticker', hotcoin({ ticker: [] })],
    ['BTC串价', hotcoin({ ticker: [hotcoinRow({ symbol: 'btc_usdt', last: '91000' })] })],
    ['错计价币', hotcoin({ ticker: [hotcoinRow({ symbol: 'bty_btc' })] })],
    ['符号大小写不精确', hotcoin({ ticker: [hotcoinRow({ symbol: 'BTY_USDT' })] })],
    ['缺symbol', hotcoin({ ticker: [hotcoinRow({ symbol: undefined })] })],
    ['重复BTY', hotcoin({ ticker: [hotcoinRow(), hotcoinRow()] })],
    ['重复一条坏价仍歧义', hotcoin({ ticker: [hotcoinRow(), hotcoinRow({ last: '0' })] })],
    ['缺last', hotcoin({ ticker: [hotcoinRow({ last: undefined })] })],
    ['零价', hotcoin({ ticker: [hotcoinRow({ last: '0' })] })],
    ['负价', hotcoin({ ticker: [hotcoinRow({ last: '-1' })] })],
    ['非数价', hotcoin({ ticker: [hotcoinRow({ last: 'NaN' })] })],
    ['无限价', hotcoin({ ticker: [hotcoinRow({ last: 'Infinity' })] })],
  ])('拒绝%s，绝不猜测别名或从BTC取值', async (_label, primary) => {
    const { runtime, network } = scannerHarness(primary);
    expect(await runtime.fetchHotcoinBtySpotQuote()).toBeNull();
    expect(network.mock.calls.map(([url]) => url)).toEqual([HOTCOIN_URL]);
  });

  it('整表中BTC在前也精确选择唯一BTY；昨日行内ts不影响响应时间', async () => {
    const { runtime } = scannerHarness(hotcoin({ timestamp: (NOW - 5_000) / 1_000,
      ticker: [null, hotcoinRow({ symbol: 'btc_usdt', last: '91000' }), hotcoinRow({ ts: NOW - 86_400_000 })] }));
    const quote = await runtime.fetchCryptoQuote('BTY');
    expect(quote).toMatchObject({ price: 0.02191, source: HOTCOIN_SOURCE, patch: { updatedAt: iso(NOW - 5_000) } });
  });

  it('没有行内ts仍用响应timestamp；过期响应不能由新鲜行内ts冒充', async () => {
    const { runtime, network } = scannerHarness(hotcoin({ ticker: [hotcoinRow({ ts: undefined })] }));
    expect((await runtime.fetchHotcoinBtySpotQuote())?.patch.updatedAt).toBe(iso(NOW));
    network.mockResolvedValue(response(hotcoin({ timestamp: NOW - 120_001, ticker: [hotcoinRow({ ts: NOW })] })));
    expect(await runtime.fetchHotcoinBtySpotQuote()).toBeNull();
  });

  it('可选统计字段缺失/无效不借MEXC补齐；缺open不制造涨跌百分数', async () => {
    const { runtime, network } = scannerHarness(hotcoin({ ticker: [hotcoinRow({
      open: undefined, high: undefined, low: '-1', vol: 'NaN', amount: '-1',
    })] }));
    const quote = await runtime.fetchCryptoQuote('BTY');
    expect(quote).toMatchObject({ price: 0.02191, source: HOTCOIN_SOURCE, patch: { updatedAt: iso(NOW) } });
    for (const field of ['todayOpen', 'changePercent', 'high24h', 'low24h', 'volume24h', 'quoteVolume24h']) {
      expect(quote?.patch[field]).toBeUndefined();
    }
    expect(network).toHaveBeenCalledTimes(1);
  });
});

describe('BTY Hotcoin → MEXC 串行回退，不混供应商字段和观察时间', () => {
  it('主源请求未完成时绝不抢发备用，主源解析失败才请求MEXC', async () => {
    const { runtime, network, timeout } = scannerHarness();
    let release!: (value: ReturnType<typeof response>) => void;
    network.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = runtime.fetchCryptoQuote('BTY');
    expect(network.mock.calls.map(([url]) => url)).toEqual([HOTCOIN_URL]);
    await Promise.resolve();
    expect(network).toHaveBeenCalledTimes(1);
    release(response(hotcoin({ status: 'error' })));
    expectMexcQuote(await pending);
    expect(network.mock.calls.map(([url]) => url)).toEqual([HOTCOIN_URL, MEXC_URL]);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([7_000, 7_000]);
  });

  it.each(['HTTP失败', '网络异常', 'JSON异常'] as const)('%s时也只回退到MEXC现货', async failure => {
    const { runtime, network } = scannerHarness();
    if (failure === 'HTTP失败') network.mockResolvedValueOnce(response({}, false));
    if (failure === '网络异常') network.mockRejectedValueOnce(new Error('offline timeout'));
    if (failure === 'JSON异常') network.mockResolvedValueOnce({ ok: true, status: 200,
      json: async () => { throw new Error('offline invalid JSON'); } });
    expectMexcQuote(await runtime.fetchCryptoQuote('BTY'));
    expect(network.mock.calls.map(([url]) => url)).toEqual([HOTCOIN_URL, MEXC_URL]);
  });

  it('过期Hotcoin字段全部舍弃，MEXC使用自己的字段和原始closeTime写缓存', async () => {
    const { runtime, network } = scannerHarness(hotcoin({ timestamp: NOW - 120_001 }));
    await runtime.updateCrypto('BTY');
    expect(runtime.getLatestTickerData('BTY')).toMatchObject({ price: 0.02179, todayOpen: 0.02286,
      high24h: 0.02293, low24h: 0.02093, volume24h: 827643.16, quoteVolume24h: 18132.83354 });
    expect(runtime.getAllLatestPrices().BTY.updatedAt).toBe(iso(NOW - 300_000));
    expect(runtime.getMarketPriceHealth().BTY).toMatchObject({ source: MEXC_SOURCE,
      lastSuccessAt: iso(NOW - 300_000), ageSeconds: 300, stale: false });
    expect(network.mock.calls.map(([url]) => url)).toEqual([HOTCOIN_URL, MEXC_URL]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { symbol: 'BTCUSDT' }, { symbol: 'BTYBTC' }, { closeTime: undefined },
    { closeTime: NOW + 1 }, { closeTime: NOW - 360_001 }, { lastPrice: '0' },
  ])('备用仍拒绝错币/过期/未来/缺时间/坏价 %j，不追加Gate/HTX/OKX', async patch => {
    const { runtime, network } = scannerHarness(hotcoin({ status: 'error' }), mexc(patch));
    expect(await runtime.fetchCryptoQuote('BTY')).toBeNull();
    expect(network.mock.calls.map(([url]) => url)).toEqual([HOTCOIN_URL, MEXC_URL]);
  });

  it('双方失败初始为null/unknown，不产生0价或BTC别名；错误信息列出两个现货源', async () => {
    const { runtime, network } = scannerHarness(hotcoin({ status: 'error' }), {});
    runtime.entryFromPrice('BTC', 90_000, 'Gate.io');
    await runtime.updateCrypto('BTY');
    expect(runtime.getLatestPrice('BTY')).toBeNull();
    expect(runtime.getLatestTickerData('BTY')).toBeNull();
    expect(runtime.getLatestPrice('BTC')).toBe(90_000);
    expect(runtime.getAllLatestPrices().BTY).toBeUndefined();
    expect(runtime.getMarketPriceHealth().BTY).toMatchObject({ source: 'none', lastSuccessAt: '',
      lastAttemptAt: iso(NOW), stale: true, consecutiveFailures: 1, lastError: FAILURE });
    expect(network.mock.calls.map(([url]) => url)).toEqual([HOTCOIN_URL, MEXC_URL]);
  });

  it.each([HOTCOIN_SOURCE, MEXC_SOURCE])('%s成功后双方失败仅保留旧缓存，绝不伪刷新', async source => {
    const observedAt = NOW - 5_000;
    const { runtime, network } = scannerHarness(
      source === HOTCOIN_SOURCE ? hotcoin({ timestamp: observedAt }) : hotcoin({ status: 'error' }),
      mexc({ closeTime: observedAt }));
    await runtime.updateCrypto('BTY');
    runtime.entryFromPrice('BTC', 90_000, 'Gate.io');
    const previous = { ...runtime.getAllLatestPrices().BTY };
    vi.setSystemTime(NOW + 360_001);
    network.mockRejectedValue(new Error('both providers offline'));
    await runtime.updateCrypto('BTY');
    expect(runtime.getRawLatestPrices().BTY).toEqual(previous);
    expect(runtime.getAllLatestPrices().BTY).toBeUndefined();
    expect(runtime.getLatestPrice('BTY')).toBeNull();
    expect(runtime.getLatestTickerData('BTY')).toBeNull();
    expect(runtime.getLatestChangePercent('BTY')).toBeNull();
    expect(runtime.getLatestPrice('BTC')).toBe(90_000);
    expect(runtime.getAllLatestPrices().BTC.price).toBe(90_000);
    expect(runtime.getMarketPriceHealth().BTY).toMatchObject({ source, lastSuccessAt: iso(observedAt),
      lastAttemptAt: iso(NOW + 360_001), stale: true, consecutiveFailures: 1, lastError: FAILURE });
    vi.setSystemTime(NOW);
    expect(runtime.getAllLatestPrices().BTY).toEqual(previous); // 原缓存未删除，只限制估值读取。
    expect(runtime.getLatestPrice('BTY')).toBe(previous.price);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('旧快速更新接口的双方失败提示也完整且释放其既有外层timer', async () => {
    const { runtime } = scannerHarness({}, {});
    await runtime.updateCryptoFast('BTY');
    expect(runtime.getMarketPriceHealth().BTY.lastError).toBe(FAILURE);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('BTY 供应商freshness、BTC/ETH隔离与原后台节拍', () => {
  it.each([[HOTCOIN_SOURCE, 120_000], [MEXC_SOURCE, 360_000]] as const)(
    '%s健康时限为%s毫秒，边界之后stale且对外隐藏旧价但不删内部缓存', async (source, maximumAge) => {
      const observedAt = NOW - maximumAge;
      const { runtime } = scannerHarness(
        source === HOTCOIN_SOURCE ? hotcoin({ timestamp: observedAt }) : hotcoin({ status: 'error' }),
        mexc({ closeTime: observedAt }));
      await runtime.updateCrypto('BTY');
      runtime.entryFromPrice('BTC', 90_000, 'Gate.io');
      const price = runtime.getLatestPrice('BTY');
      expect(price).not.toBeNull();
      expect(runtime.getMarketPriceHealth().BTY).toMatchObject({ source, lastSuccessAt: iso(observedAt),
        ageSeconds: maximumAge / 1_000, stale: false, consecutiveFailures: 0 });
      vi.setSystemTime(NOW + 1);
      expect(runtime.getMarketPriceHealth().BTY.stale).toBe(true);
      expect(runtime.getLatestPrice('BTY')).toBeNull();
      expect(runtime.getLatestTickerData('BTY')).toBeNull();
      expect(runtime.getLatestChangePercent('BTY')).toBeNull();
      expect(runtime.getAllLatestPrices().BTY).toBeUndefined();
      expect(runtime.getRawLatestPrices().BTY.price).toBe(price);
      expect(runtime.getLatestPrice('BTC')).toBe(90_000);
      vi.setSystemTime(NOW);
      expect(runtime.getLatestPrice('BTY')).toBe(price);
    });

  it.each([
    ['本地缓存边界', '本地持久化缓存', iso(NOW - 120_000), false],
    ['本地缓存过期', '本地持久化缓存', iso(NOW - 120_001), true],
    ['未知来源保守期限', 'unknown', iso(NOW - 120_001), true],
    ['坏日期', HOTCOIN_SOURCE, 'not-a-date', true],
    ['空日期', MEXC_SOURCE, '', true],
    ['Hotcoin未来日期', HOTCOIN_SOURCE, iso(NOW + 1), true],
    ['MEXC未来日期', MEXC_SOURCE, iso(NOW + 1), true],
  ] as const)('%s的helper同时控制价格/统计/涨跌/列表和health', (_label, source, updatedAt, stale) => {
    const { runtime } = scannerHarness();
    runtime.entryFromPrice('BTY', 0.02191, source, { updatedAt, changePercent: -3.98 });
    runtime.entryFromPrice('BTC', 90_000, 'Gate.io');
    expect(runtime.getMarketPriceHealth().BTY.stale).toBe(stale);
    expect(runtime.getLatestPrice('BTY')).toBe(stale ? null : 0.02191);
    expect(runtime.getLatestChangePercent('BTY')).toBe(stale ? null : -3.98);
    if (stale) {
      expect(runtime.getLatestTickerData('BTY')).toBeNull();
      expect(runtime.getAllLatestPrices().BTY).toBeUndefined();
    } else {
      expect(runtime.getLatestTickerData('BTY')).toMatchObject({ price: 0.02191 });
      expect(runtime.getAllLatestPrices().BTY.price).toBe(0.02191);
    }
    expect(runtime.getRawLatestPrices().BTY).toMatchObject({ price: 0.02191, updatedAt });
    expect(runtime.getLatestPrice('BTC')).toBe(90_000);
  });

  it.each(['BTC', 'ETH'])('%s仍按Gate → HTX → OKX回退，使用2秒预算且不请求Hotcoin/MEXC', async coin => {
    const { runtime, network, timeout } = scannerHarness();
    network.mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ status: 'error' }))
      .mockResolvedValueOnce(response({ code: '0', data: [{ last: '91000' }] }));
    expect(await runtime.fetchCryptoQuote(coin)).toMatchObject({ price: 91_000, source: 'OKX' });
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${coin}_USDT`,
      `https://api.huobi.pro/market/detail/merged?symbol=${coin.toLowerCase()}usdt`,
      `https://www.okx.com/api/v5/market/ticker?instId=${coin}-USDT`,
    ]);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([2_000, 2_000, 2_000]);
    expect(runtime.getLatestPrice('BTY')).toBeNull();
  });

  it('BTC与BTY缓存独立，BTY更新不覆盖BTC；BTC成功也不访问BTY源', async () => {
    const { runtime, network } = scannerHarness();
    runtime.entryFromPrice('BTC', 90_000, 'Gate.io');
    await runtime.updateCrypto('BTY');
    expect(runtime.getLatestPrice('bty')).toBe(0.02191);
    expect(runtime.getLatestPrice('BTC')).toBe(90_000);
    network.mockClear();
    network.mockResolvedValue(response([{ currency_pair: 'BTC_USDT', last: '91000' }]));
    expect(await runtime.fetchCryptoQuote('BTC')).toMatchObject({ price: 91_000, source: 'Gate.io' });
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toContain('api.gateio.ws');
    expect(runtime.getLatestPrice('BTY')).toBe(0.02191);
    expect(runtime.getMarketPriceHealth().BTY.source).toBe(HOTCOIN_SOURCE);
  });

  it('三秒批量刷新仍含BTC/ETH、排除BTY；两个BTY解析器都调用既有fetchJson且无新增timer', async () => {
    const updateCryptoFast = vi.fn(async (_coin: string) => {});
    const refresh = evaluate<() => Promise<void>>(`${fn('updateAllCryptoFast')} updateAllCryptoFast;`, {
      CRYPTO_COINS: evaluate(`(${init('CRYPTO_COINS')});`), updateCryptoFast,
    });
    await refresh();
    const coins = updateCryptoFast.mock.calls.map(([coin]) => coin);
    expect(coins).toContain('BTC'); expect(coins).toContain('ETH'); expect(coins).not.toContain('BTY');
    for (const name of ['fetchHotcoinBtySpotQuote', 'fetchMexcBtySpotQuote']) {
      expect(fn(name)).toContain('await fetchJson(');
    }
    for (const name of ['fetchHotcoinBtySpotQuote', 'fetchMexcBtySpotQuote', 'fetchCryptoQuote', 'updateCrypto', 'scanPricesInternal']) {
      const node = required(nodes(scanner, ts.isFunctionDeclaration).find(item => item.name?.text === name), name);
      expect(nodes(node, ts.isCallExpression).map(call => call.expression.getText()))
        .not.toEqual(expect.arrayContaining(['setInterval']));
      expect(nodes(node, ts.isCallExpression).map(call => call.expression.getText()))
        .not.toEqual(expect.arrayContaining(['setTimeout']));
    }
  });

  it('复用15秒后台任务：慢源未完成不重入、不阻塞BTC/ETH主周期、完成后按原节拍再运行', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    let finishBty!: () => void; let finishSecurities!: () => void;
    const pendingBty = new Promise<void>(resolve => { finishBty = resolve; });
    const pendingSecurities = new Promise<void>(resolve => { finishSecurities = resolve; });
    const updateCrypto = vi.fn(async (_coin: string) => pendingBty);
    const updateSecuritiesAndCommodities = vi.fn(async () => pendingSecurities);
    const updateAllCryptoFast = vi.fn(async () => {});
    const scan = evaluate<() => Promise<void>>(`
      const SLOW_MARKET_SCAN_INTERVAL_MS = ${init('SLOW_MARKET_SCAN_INTERVAL_MS')};
      let usdtCnyRefreshInProgress = true; let slowMarketScanInProgress = false; let lastSlowMarketScanAt = 0;
      ${fn('scanPricesInternal')} scanPricesInternal;`, {
      Date, Promise, console, updateCrypto, updateSecuritiesAndCommodities, updateAllCryptoFast,
      saveCacheToFile: vi.fn(),
    });
    expect(evaluate<number>(init('SLOW_MARKET_SCAN_INTERVAL_MS'))).toBe(15_000);
    await scan();
    expect(updateCrypto).toHaveBeenCalledWith('BTY');
    vi.setSystemTime(NOW + 10_000);
    await scan();
    expect(updateAllCryptoFast).toHaveBeenCalledTimes(2);
    expect(updateCrypto).toHaveBeenCalledTimes(1);
    expect(updateSecuritiesAndCommodities).toHaveBeenCalledTimes(1);
    finishBty(); finishSecurities();
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    vi.setSystemTime(NOW + 14_999);
    await scan();
    expect(updateCrypto).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 15_000);
    await scan();
    expect(updateCrypto).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
