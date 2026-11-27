import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_WALLET_ASSETS, AI_WALLET_ASSET_CATALOG, AI_WALLET_ASSET_COLORS,
  AI_WALLET_CRYPTO_MARKET_ASSETS, AI_WALLET_FUNDING_ASSETS,
  AI_WALLET_MARKET_ASSETS, AI_WALLET_SETTLEMENT_ASSETS,
} from '../shared/ai-wallet-assets';
import { calculateMibanWalletValue } from '../shared/miban-wallet-value';
import { getWalletFlowCategory } from '../client/src/lib/walletFlowPresentation';
import { buildWalletDigitalAssets, formatDigitalAssetAmount } from '../client/src/lib/walletDigitalAssets';
import { getCryptoAssetIconSrc } from '../client/src/lib/cryptoAssetIcons';
import { CRYPTO_ASSET_CODES, isCryptoAssetCode } from '../shared/crypto-asset-catalog';
import { CryptoQuoteDemandRegistry, LEGACY_CRYPTO_QUOTE_SYMBOLS } from './crypto-quote-demand';
import type { UnifiedCryptoSpotQuote } from './crypto-spot-quote-cache';
import { getWalletAssetCategory, getWalletAssetFilterCodes, matchesWalletAssetFilter } from '../shared/wallet-asset-filters';

// 离线：只导入纯目录/helper及无启动I/O的需求registry；查询显式注入空行，不使用默认DB查询。
// DB、路由、共享provider和scanner模块不import、不启动。
// 在无process/require/import的VM里抽取真实函数/validator；fetch全部为本地公开接口夹具。
// 身份：父任务核验 https://www.bityuan.com/ 为 Bityuan 比特元 BTY；不是 Bitcoin BTC。
// 现货契约：父任务核验 MEXC /api/v3/ticker/24hr?symbol=BTYUSDT，Gate/HTX无该交易对。
function parse(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, relative.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return result;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function init(ast: ts.Node, name: string): ts.Expression {
  return required(nodes(ast, ts.isVariableDeclaration).find(n => n.name.getText() === name)?.initializer, name);
}
function evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(source, {
    fileName: 'offline.tsx', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
function expression<T>(ast: ts.Node, name: string, bindings: Record<string, unknown>): T {
  return evaluate<T>(`(${init(ast, name).getText()});`, bindings);
}
function fn(ast: ts.Node, name: string): string {
  return required(nodes(ast, ts.isFunctionDeclaration).find(n => n.name?.text === name), name)
    .getText().replace(/^export\s+/, '');
}
function validator(ast: ts.Node, property: string) {
  const prop = required(nodes(ast, ts.isPropertyAssignment).find(n => n.name.getText() === property), property);
  const input = required(nodes(prop, ts.isCallExpression).find(n => ts.isPropertyAccessExpression(n.expression)
    && n.expression.name.text === 'input'), `${property}.input`);
  return evaluate<z.ZodType>(`(${required(input.arguments[0], 'schema').getText()});`, { z, AI_WALLET_SETTLEMENT_ASSETS });
}
const db = parse('./db-multi-asset-wallet.ts');
const scanner = parse('./price-scanner.ts');
const miban = parse('./miban.ts');
const routes = parse('./routers.ts');
const funds = parse('../client/src/pages/AfRechargeManage.tsx');
const detail = parse('../client/src/pages/MultiAssetWalletTransactions.tsx');
const bindings = { AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS,
  MULTI_ASSET_WALLET_ASSETS: AI_WALLET_SETTLEMENT_ASSETS };
const decimals = ['DECIMAL_PATTERN', 'SIGNED_DECIMAL_PATTERN']
  .map(name => `const ${name} = ${init(db, name).getText()};`).join('\n');
const names = ['getAssetName', 'normalizeMultiAssetWalletAsset', 'normalizeUnsignedDecimal',
  'normalizeSignedDecimal', 'entryResult', 'normalizeWalletDecimal', 'compareWalletDecimals', 'normalizeWalletCollateralAssets'];
const wallet = evaluate<{
  normalizeMultiAssetWalletAsset: (value: unknown) => string;
  normalizeSignedDecimal: (value: string) => string;
  entryResult: (row: Record<string, unknown>) => Record<string, unknown>;
  normalizeWalletCollateralAssets: (items: Array<{ coin: string; qty: string }>) => Array<{ assetCode: string; amount: string }>;
}>(`${decimals}\n${names.map(name => fn(db, name)).join('\n')}\n({${names.join(',')}});`, bindings);
const NOW = Date.parse('2026-11-18T01:47:07.880Z');
function ticker(patch: Record<string, unknown> = {}) {
  return { symbol: 'BTYUSDT', lastPrice: '0.02179', openPrice: '0.02286', highPrice: '0.02293',
    lowPrice: '0.02093', volume: '827643.16', quoteVolume: '18132.83354', priceChangePercent: '-0.0468', closeTime: NOW, ...patch };
}
function scannerHarness(response: unknown = ticker(), ok = true) {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  // 本组延续MEXC解析回归：模拟热币主源不可用，真实处理器才转入备用。
  const network = vi.fn(async (url: string, _init?: RequestInit) => url.includes('hotcoinfin.com')
    ? ({ ok: false, status: 503, json: async () => ({}) })
    : ({ ok, status: ok ? 200 : 503, json: async () => response }));
  const sharedQuotes = new Map<string, UnifiedCryptoSpotQuote>();
  // BTY永远不能由共享provider提供；只有非BTY隔离夹具才能显式写入peek。
  const getUnifiedCryptoSpotQuotes = vi.fn(async (codes: readonly string[]) => {
    expect(codes).toEqual([]);
    return {};
  });
  const peekUnifiedCryptoSpotQuote = vi.fn((code: string) => {
    expect(code).not.toBe('BTY');
    const quote = sharedQuotes.get(code);
    const age = quote ? Date.now() - Date.parse(quote.updatedAt) : NaN;
    return quote && age >= 0 && age <= 120_000 ? quote : null;
  });
  const getUnifiedCryptoSpotQuoteHealth = vi.fn(() => {
    throw new Error('BTY must not consult shared provider health');
  });
  const touchCryptoQuoteDemand = vi.fn((_symbols: readonly string[]) => {});
  const variables = ['REQUEST_TIMEOUT_MS', 'CRYPTO_REQUEST_TIMEOUT_MS', 'FAST_CRYPTO_CYCLE_TIMEOUT_MS', 'CRYPTO_SCAN_INTERVAL_MS',
    'BTY_SPOT_QUOTE_MAX_AGE_MS', 'BTY_HOTCOIN_QUOTE_MAX_AGE_MS', 'CRYPTO_COINS', 'ETH_PERP_MARK_CACHE_KEY', 'KRW_COINS',
    'legacyCryptoCodes', 'specialSpotFlights', 'legacySpotRetryAt'];
  const functions = ['nowIso', 'isValidPrice', 'setPrice', 'markFailure', 'entryFromPrice', 'fetchJson', 'fetchCryptoJson',
    'fetchHotcoinBtySpotQuote', 'fetchMexcBtySpotQuote', 'fetchCryptoQuote', 'fetchOkxSpotQuote',
    'recordSharedCryptoSpotQuotes', 'refreshLegacySpecialSpot', 'refreshDemandCryptoSpotPrices', 'ensureCryptoSpotPrices',
    'updateCryptoFast', 'isBtySpotQuoteFresh', 'freshPriceEntry', 'getLatestPrice', 'getLatestTickerData', 'getMarketPriceHealth'];
  const runtime = evaluate<{
    fetchCryptoQuote: (coin: string) => Promise<{ price: number; source: string; patch: Record<string, unknown> } | null>;
    updateCryptoFast: (coin: string) => Promise<void>;
    ensureCryptoSpotPrices: (symbols: readonly string[]) => Promise<void>;
    recordSharedCryptoSpotQuotes: (quotes: Record<string, UnifiedCryptoSpotQuote>) => void;
    getLatestPrice: (coin: string) => number | null;
    getLatestTickerData: (coin: string) => Record<string, unknown> | null;
    getMarketPriceHealth: () => Record<string, Record<string, unknown>>;
    entryFromPrice: (coin: string, price: number, source: string) => void;
  }>(`${variables.map(name => `const ${name} = ${init(scanner, name).getText()};`).join('\n')}
const latestPrices = {}; const priceHealth = {};
${functions.map(name => fn(scanner, name)).join('\n')}
({${functions.join(',')}});`, {
    fetch: network, Date, AbortSignal, setTimeout, clearTimeout, CRYPTO_ASSET_CODES, isCryptoAssetCode,
    LEGACY_CRYPTO_QUOTE_SYMBOLS, getUnifiedCryptoSpotQuotes, peekUnifiedCryptoSpotQuote,
    getUnifiedCryptoSpotQuoteHealth, touchCryptoQuoteDemand,
  });
  const seedSharedSpotQuote = (code: string, price: number) => {
    expect(code).not.toBe('BTY');
    const quote: UnifiedCryptoSpotQuote = { code, price, currency: 'USDT', source: 'Gate.io', updatedAt: new Date().toISOString() };
    sharedQuotes.set(code, quote);
    runtime.recordSharedCryptoSpotQuotes({ [code]: quote });
  };
  return { runtime: { ...runtime, seedSharedSpotQuote }, network,
    getUnifiedCryptoSpotQuotes, peekUnifiedCryptoSpotQuote, getUnifiedCryptoSpotQuoteHealth, touchCryptoQuoteDemand };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('BTY 比特元钱包独立目录与真实validator（无DB）', () => {
  it('所有真实钱包/市场/结算目录都含独立BTY，名称和颜色完整，不当作BTC或资金账户', () => {
    for (const codes of [AI_WALLET_ASSETS, AI_WALLET_CRYPTO_MARKET_ASSETS, AI_WALLET_MARKET_ASSETS, AI_WALLET_SETTLEMENT_ASSETS]) {
      expect(codes).toContain('BTY'); expect(codes).toContain('BTC');
      expect(new Set(codes).size).toBe(codes.length);
    }
    expect(AI_WALLET_FUNDING_ASSETS).not.toContain('BTY');
    expect(AI_WALLET_ASSET_CATALOG.find(asset => asset.code === 'BTY')).toMatchObject({
      code: 'BTY', name: '比特元', category: 'market', currentSupport: true, walletLedgerEnabled: true,
    });
    expect(AI_WALLET_ASSET_CATALOG.find(asset => asset.code === 'BTC')?.name).toBe('比特币');
    for (const code of AI_WALLET_ASSETS) {
      expect(AI_WALLET_ASSET_CATALOG.find(asset => asset.code === code)?.name).toBeTruthy();
      expect(AI_WALLET_ASSET_COLORS[code]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(AI_WALLET_ASSET_COLORS.BTY).not.toBe(AI_WALLET_ASSET_COLORS.BTC);
  });
  it('真实DB枚举复用目录，数量8位原字符串可正负记账且流水保持BTY不折BTC/USDT', () => {
    expect(expression(db, 'MULTI_ASSET_WALLET_ASSETS', bindings)).toBe(AI_WALLET_SETTLEMENT_ASSETS);
    expect(wallet.normalizeMultiAssetWalletAsset(' bty ')).toBe('BTY');
    expect(wallet.normalizeMultiAssetWalletAsset('BTC')).toBe('BTC');
    expect(() => wallet.normalizeMultiAssetWalletAsset('BITYUAN')).toThrow();
    expect(wallet.normalizeSignedDecimal('0.00000001')).toBe('0.00000001');
    expect(wallet.normalizeSignedDecimal('-1.12345678')).toBe('-1.12345678');
    const row = wallet.entryResult({ id: 1, entry_no: 'WAE_offline', request_id: 'offline_request_00001',
      asset_code: 'BTY', amount: '-0.00000001', balance_after: '1.12345678', event_type: 'admin_adjustment',
      created_at: '2026-11-18T00:00:00Z', note: '离线夹具，未写入数据库' });
    expect(row).toMatchObject({ assetCode: 'BTY', assetName: '比特元', amount: '-0.00000001', balanceAfter: '1.12345678' });
  });
  it('从实际调账/转账/历史路由抽取zod输入schema，BTY可独立8位数量，未知代码和number金额拒绝', () => {
    const adjustment = validator(miban, 'multiAssetWalletAdjust');
    const input = { userId: 28, assetCode: 'BTY', amount: '-0.00000001', requestId: 'offline_request_00001' };
    expect(adjustment.parse(input)).toEqual(input);
    expect(adjustment.safeParse({ ...input, amount: 0.00000001 }).success).toBe(false);
    expect(adjustment.safeParse({ ...input, assetCode: 'BITYUAN' }).success).toBe(false);
    const transfer = validator(routes, 'transferMultiAssetBalance');
    expect(transfer.parse({ toUserId: 29, assetCode: 'BTY', amount: '1.12345678', requestId: input.requestId, sourceLedgerId: 52 }))
      .toMatchObject({ assetCode: 'BTY', amount: '1.12345678' });
    expect(validator(miban, 'multiAssetWalletHistoryPage').parse({ userId: 28, assetCode: 'BTY' }))
      .toMatchObject({ assetCode: 'BTY', page: 1, pageSize: 10 });
  });
  it('真实担保数量validator将BTY和BTC分开，不混算，不新增链网络', () => {
    expect(wallet.normalizeWalletCollateralAssets([{ coin: 'BTY', qty: '0.00000001' }, { coin: 'BTC', qty: '1.12345678' }]))
      .toEqual([{ assetCode: 'BTC', amount: '1.12345678' }, { assetCode: 'BTY', amount: '0.00000001' }]);
    expect(() => wallet.normalizeWalletCollateralAssets([{ coin: 'BTY', qty: '0' }])).toThrow();
    expect(AI_WALLET_ASSET_CATALOG.find(asset => asset.code === 'BTY')?.detail).toContain('须完成网络配置后另行开放');
  });
  it('三类资金helper把BTY归digital，资产详情保持BTY/比特元且调账与明细下拉使用同一目录', () => {
    expect(getWalletFlowCategory('BTY')).toBe('digital');
    expect(getWalletFlowCategory(' bty ')).toBe('digital');
    expect(getWalletFlowCategory('USDT')).toBe('stable'); expect(getWalletFlowCategory('CNY')).toBe('cny');
    const assetCode = expression<string>(detail, 'assetCode', { ...bindings, requestedAsset: 'BTY' });
    expect(assetCode).toBe('BTY');
    expect(expression(detail, 'asset', { ...bindings, assetCode })).toMatchObject({ code: 'BTY', name: '比特元' });
    for (const [ast, directory] of [[funds, 'AI_WALLET_CRYPTO_MARKET_ASSETS'], [detail, 'AI_WALLET_SETTLEMENT_ASSETS']] as const) {
      const map = required(nodes(ast, ts.isCallExpression).find(node => node.expression.getText() === `${directory}.map`), 'real dropdown');
      const options = evaluate<Array<{ type: string; props: Record<string, unknown>; children: unknown[] }>>(`(${map.getText()});`, {
        AI_WALLET_CRYPTO_MARKET_ASSETS, ...bindings, assetCode: 'BTY', availableAssets: ['BTY'],
        React: { createElement: (type: string, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props, children }) },
      });
      expect(options.find(option => option.props.value === 'BTY')).toMatchObject({ type: 'option', props: { value: 'BTY' } });
      expect(options.find(option => option.props.value === 'BTY')?.children).toContain('比特元');
      expect(map.getText()).toContain('<option');
    }
    expect(formatDigitalAssetAmount('BTY', 0.00000001)).toBe('0.00000001');
  });
  it('真实BTY图标映射为受版本管理的本地PNG，独立于BTC且PNG能完整解码', async () => {
    expect(getCryptoAssetIconSrc('BTY')).toBe('/assets/crypto-icons/bty.png');
    expect(getCryptoAssetIconSrc(' bty ')).toBe('/assets/crypto-icons/bty.png');
    expect(getCryptoAssetIconSrc('BTY')).not.toBe(getCryptoAssetIconSrc('BTC'));
    const png = readFileSync(new URL('../client/public/assets/crypto-icons/bty.png', import.meta.url));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const metadata = await sharp(png, { failOn: 'error' }).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 200, height: 200 });
    const decoded = await sharp(png, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
    expect(decoded.data.length).toBe(decoded.info.width * decoded.info.height * decoded.info.channels);
  });
});

describe('BTY 真实MEXC现货解析与原扫描缓存隔离（fetch本地夹具）', () => {
  it('严格BTYUSDT匹配，字段来自真实provider解析，有界超时且24h涨跌不误乘比例', async () => {
    const { runtime, network } = scannerHarness();
    const quote = await runtime.fetchCryptoQuote('BTY');
    expect(quote).toMatchObject({ price: 0.02179, source: 'MEXC BTY/USDT 现货', patch: {
      todayOpen: 0.02286, high24h: 0.02293, low24h: 0.02093, volume24h: 827643.16, quoteVolume24h: 18132.83354,
      updatedAt: new Date(NOW).toISOString(),
    } });
    expect(quote?.patch.changePercent).toBeCloseTo(((0.02179 - 0.02286) / 0.02286) * 100, 10);
    expect(network).toHaveBeenCalledTimes(2);
    expect(network.mock.calls[0][0]).toBe('https://api.hotcoinfin.com/v1/market/ticker');
    expect(network.mock.calls[1][0]).toBe('https://api.mexc.com/api/v3/ticker/24hr?symbol=BTYUSDT');
    expect(network.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    { symbol: 'BTCUSDT' }, { symbol: 'BTYBTC' }, { symbol: '' },
    { lastPrice: '0' }, { lastPrice: '-1' }, { lastPrice: 'NaN' }, { lastPrice: 'Infinity' },
    { closeTime: undefined }, { closeTime: NOW + 1 }, { closeTime: NOW - 360_001 },
  ])('拒绝错币/错计价单位/无效报价/未来或过期timestamp %j', async patch => {
    const { runtime, network } = scannerHarness(ticker(patch));
    expect(await runtime.fetchCryptoQuote('BTY')).toBeNull();
    expect(runtime.getLatestPrice('BTY')).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('允许官方五分钟滚动统计closeTime加一分钟容差，仍保留旧观察时刻且边界后stale', async () => {
    const { runtime } = scannerHarness(ticker({ closeTime: NOW - 360_000 }));
    await runtime.updateCryptoFast('BTY');
    expect(runtime.getLatestPrice('BTY')).toBe(0.02179);
    expect(runtime.getMarketPriceHealth().BTY).toMatchObject({ stale: false, ageSeconds: 360,
      lastSuccessAt: new Date(NOW - 360_000).toISOString() });
    vi.setSystemTime(NOW + 1);
    expect(runtime.getMarketPriceHealth().BTY.stale).toBe(true);
  });
  it('快周期成功保存provider观察时刻和健康标签；BTC单独报价且不请求MEXC', async () => {
    const { runtime, network } = scannerHarness(ticker({ closeTime: NOW - 3_000 }));
    runtime.seedSharedSpotQuote('BTC', 90_000);
    await runtime.updateCryptoFast('BTY');
    expect(runtime.getLatestPrice('bty')).toBe(0.02179); expect(runtime.getLatestPrice('BTC')).toBe(90_000);
    expect(runtime.getMarketPriceHealth().BTY).toMatchObject({ source: 'MEXC BTY/USDT 现货',
      lastSuccessAt: new Date(NOW - 3_000).toISOString(), ageSeconds: 3, stale: false, consecutiveFailures: 0 });
    network.mockClear();
    network.mockResolvedValue({ ok: true, status: 200, json: async () => [{ currency_pair: 'BTC_USDT', last: '91000' }] });
    expect(await runtime.fetchCryptoQuote('BTC')).toMatchObject({ price: 91_000, source: 'Gate.io' });
    expect(network.mock.calls[0][0]).toContain('api.gateio.ws');
    expect(network.mock.calls.some(([url]) => url.includes('mexc'))).toBe(false);
    expect(runtime.getLatestPrice('BTY')).toBe(0.02179);
  });
  it('初始缺价为null，失败记录none/unknown健康、不生成0价/BTC别名，最后成功值只保留为旧缓存', async () => {
    const { runtime, network } = scannerHarness({}, false);
    runtime.seedSharedSpotQuote('BTC', 90_000);
    await runtime.updateCryptoFast('BTY');
    expect(runtime.getLatestPrice('BTY')).toBeNull(); expect(runtime.getLatestTickerData('BTY')).toBeNull();
    expect(runtime.getMarketPriceHealth().BTY).toMatchObject({ source: 'none', stale: true,
      consecutiveFailures: 1, lastSuccessAt: '', lastError: '未取得有效Hotcoin或MEXC BTY/USDT现货行情' });
    // 新兼容路径有既有三秒重试节流，重试必须跨过实际生产边界。
    vi.setSystemTime(NOW + 3_000);
    network.mockResolvedValue({ ok: true, status: 200, json: async () => ticker() });
    await runtime.updateCryptoFast('BTY');
    vi.setSystemTime(NOW + 6_000);
    network.mockRejectedValue(new Error('offline timeout'));
    await runtime.updateCryptoFast('BTY');
    vi.setSystemTime(NOW + 360_001);
    expect(runtime.getLatestPrice('BTY')).toBeNull();
    expect(runtime.getLatestTickerData('BTY')).toBeNull();
    expect(runtime.getMarketPriceHealth().BTY).toMatchObject({ stale: true, consecutiveFailures: 1,
      lastSuccessAt: new Date(NOW).toISOString(), source: 'MEXC BTY/USDT 现货' });
    // 只拦截过期估值，不删除最后成功缓存；回拨测试时钟可证明原记录仍在。
    vi.setSystemTime(NOW);
    expect(runtime.getLatestPrice('BTY')).toBe(0.02179);
    expect(vi.getTimerCount()).toBe(0); // 新兼容刷新不启动scanner或新增timer。
  });
});

describe('BTY 无行情仍显示独立数量与unknown估值', () => {
  it('米伴真实纯helper保留8位BTY数量，BTC现货不替代BTY，missingPrices+null而非0估值', () => {
    const result = calculateMibanWalletValue({ usdt: { total: 10, available: 10, frozen: 0 },
      cny: { total: 0, available: 0, frozen: 0 }, usdtCnyRate: 7,
      assets: [{ assetCode: 'BTY', assetName: '比特元', availableBalance: '1.12345678', frozenBalance: '0.00000001' }],
      prices: { BTC: 90_000 } });
    expect(result.missingPrices).toEqual(['BTY']); expect(result.totalCny).toBeNull(); expect(result.availableUsdt).toBeNull();
    expect(result.rows.find(row => row.assetCode === 'BTY')).toMatchObject({ assetCode: 'BTY', available: 1.12345678,
      frozen: 0.00000001, priceUsdt: null, availableCny: null, frozenCny: null });
    expect(buildWalletDigitalAssets(undefined, [{ assetCode: 'BTY', availableBalance: 1.12345678, frozenBalance: 0.00000001 }])
      .map(asset => asset.assetCode)).toContain('BTY');
  });
  it('资金页实际估值expression保留BTY unpricedAssets及null，UI明确“未取得行情”', () => {
    const adjBalanceAssetFilter = { category: 'all', assetCode: 'all' };
    const adjWalletAssetFilterCodes = expression<string[]>(funds, 'adjWalletAssetFilterCodes', {
      getWalletAssetFilterCodes, adjBalanceAssetFilter, adjGlobalAssetFilter: adjBalanceAssetFilter,
      adjUserList: [{ multiAssetBalances: [{ assetCode: 'BTY' }] }], adjLogItems: [],
    });
    const valuations = expression<Array<{ assetCode: string; valueU: number | null; priceU: number | null }>>(funds, 'adjMultiAssetValuations', {
      AI_WALLET_SETTLEMENT_ASSETS, adjMultiAssetTotals: { BTY: 1.12345678 }, adjMultiAssetFrozenTotals: { BTY: 0.00000001 },
      adjBalancePrices: { BTC: 90_000 }, adjWalletAssetFilterCodes, adjBalanceAssetFilter,
      getWalletAssetCategory, matchesWalletAssetFilter,
    });
    expect(valuations.find(asset => asset.assetCode === 'BTY')).toMatchObject({ priceU: null, valueU: null });
    expect(expression(funds, 'adjBalanceUnpricedAssets', { adjMultiAssetValuations: valuations })).toEqual(['BTY']);
    expect(funds.getText()).toContain('未取得行情，暂未计入：');
  });
});

describe('BTY 慢源隔离，不改变普通数字币快周期', () => {
  it('真实通用请求给慢源7秒，而原数字币请求仍只有2秒', async () => {
    const budgets: number[] = [];
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ symbol: 'BTYUSDT' }) }));
    const api = evaluate<{ fetchJson: (url: string) => Promise<unknown>; fetchCryptoJson: (url: string) => Promise<unknown> }>(`
      const REQUEST_TIMEOUT_MS = ${init(scanner, 'REQUEST_TIMEOUT_MS').getText()};
      const CRYPTO_REQUEST_TIMEOUT_MS = ${init(scanner, 'CRYPTO_REQUEST_TIMEOUT_MS').getText()};
      ${fn(scanner, 'fetchJson')} ${fn(scanner, 'fetchCryptoJson')}
      ({fetchJson, fetchCryptoJson});`, {
      fetch, AbortSignal: { timeout: (ms: number) => { budgets.push(ms); return {}; } },
    });
    await api.fetchJson('https://api.mexc.com/api/v3/ticker/24hr?symbol=BTYUSDT');
    await api.fetchCryptoJson('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT');
    expect(budgets).toEqual([7_000, 2_000]);
    expect(fn(scanner, 'fetchMexcBtySpotQuote')).toContain('await fetchJson(');
  });
  it('真实三秒批量刷新只取实际活跃BTC/ETH，活跃BTY仍排除到独立后台', async () => {
    const demand = new CryptoQuoteDemandRegistry({ query: vi.fn(async () => []), pins: ['BTC', 'ETH'] });
    await demand.refresh(); // 注入空行后退出39币保守fallback，无生产DB。
    demand.touch(['BTY']);
    const getActiveCryptoQuoteSymbols = vi.fn(() => demand.active());
    const refreshDemandCryptoSpotPrices = vi.fn(async (_symbols: readonly string[]) => {});
    const refresh = evaluate<() => Promise<void>>(`${fn(scanner, 'updateAllCryptoFast')} updateAllCryptoFast;`, {
      getActiveCryptoQuoteSymbols, refreshDemandCryptoSpotPrices,
    });
    await refresh();
    expect(getActiveCryptoQuoteSymbols).toHaveBeenCalledTimes(1);
    expect(demand.active()).toContain('BTY');
    const codes = refreshDemandCryptoSpotPrices.mock.calls[0][0];
    expect(codes).toContain('BTC'); expect(codes).toContain('ETH'); expect(codes).not.toContain('BTY');
    expect(codes).toEqual(['BTC', 'ETH']); // 不因216币目录而急切请求闲置币。
  });
  it('BTY复用已有15秒后台任务，慢请求不阻塞主周期且未完成不重入', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    let finishBty!: () => void; let finishSecurities!: () => void;
    const pendingBty = new Promise<void>((resolve) => { finishBty = resolve; });
    const pendingSecurities = new Promise<void>((resolve) => { finishSecurities = resolve; });
    const updateCryptoFast = vi.fn(async (_coin: string) => pendingBty);
    const updateSecuritiesAndCommodities = vi.fn(async () => pendingSecurities);
    const saveCacheToFile = vi.fn(); const updateAllCryptoFast = vi.fn(async () => {});
    const demand = new CryptoQuoteDemandRegistry({ query: vi.fn(async () => []), pins: ['BTC', 'ETH'] });
    await demand.refresh(); demand.touch(['BTY']);
    const getActiveCryptoQuoteSymbols = vi.fn(() => demand.active());
    const refreshPersistentCryptoQuoteDemand = vi.fn(() => demand.refresh());
    const scan = evaluate<() => Promise<void>>(`
      const SLOW_MARKET_SCAN_INTERVAL_MS = ${init(scanner, 'SLOW_MARKET_SCAN_INTERVAL_MS').getText()};
      let usdtCnyRefreshInProgress = true; let slowMarketScanInProgress = false; let lastSlowMarketScanAt = 0;
      ${fn(scanner, 'scanPricesInternal')} scanPricesInternal;`, {
      Date, Promise, console, updateAllCryptoFast, updateSecuritiesAndCommodities, updateCryptoFast, saveCacheToFile,
      getActiveCryptoQuoteSymbols, refreshPersistentCryptoQuoteDemand,
    });
    await scan();
    expect(demand.active()).toContain('BTY');
    expect(getActiveCryptoQuoteSymbols).toHaveBeenCalledTimes(1);
    expect(updateCryptoFast).toHaveBeenCalledWith('BTY');
    expect(updateSecuritiesAndCommodities).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 30_000);
    await scan();
    expect(updateAllCryptoFast).toHaveBeenCalledTimes(2);
    expect(updateCryptoFast).toHaveBeenCalledTimes(1);
    expect(updateSecuritiesAndCommodities).toHaveBeenCalledTimes(1);
    finishBty(); finishSecurities();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    vi.setSystemTime(NOW + 60_000);
    await scan();
    expect(updateCryptoFast).toHaveBeenCalledTimes(2);
    expect(refreshPersistentCryptoQuoteDemand).toHaveBeenCalledTimes(3);
  });
});
