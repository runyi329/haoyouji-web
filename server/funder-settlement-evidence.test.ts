import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as evidence from './shared/funder-settlement-evidence';
import { TRPCError } from '@trpc/server';

const info = () => ({ coin: 'ETH', exerciseDate: '2026-11-27', strikePrice: '3500', direction: 'long_put', premium: '15.1200', buyQty: '48.5', denomination: 'USDT' });
const instrument = evidence.buildFunderOptionInstrument(info())!;
const options = { isHistorical: false, quotedAt: '2026-11-22T01:55:00Z' };
const currentQuote = (patch: any = {}) => ({ instrumentName: instrument.instrumentName, markPrice: '3.5', source: 'gateio', ...patch });
const scope: evidence.FunderSettlementEvidenceScope = { ledgerId: 52, orderId: 123, userId: 77, participantId: 9, jointSegmentId: 'segment-2', physicalOwnerUserId: 28, sourceKind: 'joint_segment' };

const missingNumbers = [null, undefined, '', ' ', false, true, [], {}, NaN, Infinity, -Infinity, 'no', '3.5bad', '0x10'];
describe('结算证据纯helper：缺值、真实零、合约身份', () => {
  it.each(missingNumbers)('非法数值 %j 不转成零', value => {
    expect(evidence.readFunderEvidenceNumber(value)).toBeNull();
    expect(evidence.readFunderOptionSettlementMark(value)).toBeNull();
  });
  it.each([0, '0', '0.0000'])('真实零 %j 保留', value => {
    expect(evidence.readFunderEvidenceNumber(value)).toBe(0);
    expect(evidence.readFunderOptionSettlementMark(value)).toBe(0);
  });
  it('负Greeks允许而负合约价拒绝；不截断小数', () => {
    expect(evidence.readFunderEvidenceNumber('-0.00001')).toBe(-0.00001);
    expect(evidence.readFunderOptionSettlementMark('-0.00001')).toBeNull();
    expect(evidence.readFunderOptionSettlementMark('0.000001')).toBe(0.000001);
  });
  it.each(['long_call', 'short_call', 'long_put', 'short_put'])('完整身份方向 %s', direction => {
    expect(evidence.buildFunderOptionInstrument({ ...info(), direction })?.instrumentName).toBe(`ETH-27NOV26-3500-${direction.endsWith('call') ? 'C' : 'P'}`);
  });
  it.each([{ direction: undefined }, { direction: '' }, { direction: 'unknown' }, { coin: 'SOL' }, { exerciseDate: '2026-02-30' }, { exerciseDate: '2026-02-30T16:00:00Z' }, { exerciseDate: '' }, { exerciseDate: false }, { strikePrice: true }, { strikePrice: null }, { strikePrice: '1junk' }])('不完整身份 %j 不猜作put', patch => {
    expect(evidence.buildFunderOptionInstrument({ ...info(), ...patch })).toBeNull();
  });
  it('保留UTC ISO日期转北京时间兼容', () => {
    expect(evidence.buildFunderOptionInstrument({ ...info(), exerciseDate: '2026-11-26T16:00:00.000Z' })?.instrumentName).toBe(instrument.instrumentName);
  });
  it.each([false, true])('历史=%s 手填0不请求行情', async isHistorical => {
    const load = vi.fn(async () => currentQuote({ markPrice: '99' }));
    const quote = await evidence.captureFunderOptionEvidence(info(), { ...options, isHistorical, manualMarkPrice: '0' }, load);
    expect(load).not.toHaveBeenCalled();
    expect(quote).toMatchObject({ markPriceUsdt: '0', source: isHistorical ? 'manual_historical' : 'manual_confirmed', delta: null });
    expect(evidence.getFunderOptionSettlementEvidenceError('crypto_option', quote)).toBeNull();
  });
  it.each([...missingNumbers.filter(value => value !== undefined), -1, '-1'])('非法显式手填 %j 不回退缓存', async manualMarkPrice => {
    const load = vi.fn(async () => currentQuote());
    const quote = await evidence.captureFunderOptionEvidence(info(), { ...options, manualMarkPrice }, load);
    expect(load).not.toHaveBeenCalled();
    expect(quote.markPriceUsdt).toBeNull();
    expect(evidence.getFunderOptionSettlementEvidenceError('crypto_option', quote)).toContain('填写真实期权合约结算价');
  });
  it('历史没有手填不读取今日行情；缺身份即便手填仍拒绝', async () => {
    const load = vi.fn(async () => currentQuote());
    const historical = await evidence.captureFunderOptionEvidence(info(), { ...options, isHistorical: true }, load);
    const unidentified = await evidence.captureFunderOptionEvidence(null, { ...options, manualMarkPrice: '0' }, load);
    expect(load).not.toHaveBeenCalled();
    expect(evidence.getFunderOptionSettlementEvidenceError('crypto_option', historical)).not.toBeNull();
    expect(evidence.getFunderOptionSettlementEvidenceError('crypto_option', unidentified)).toContain('身份');
  });
  it.each([0, '0', '3.5'])('同一合约合法live价 %j 与nullable Greeks', async markPrice => {
    const quote = await evidence.captureFunderOptionEvidence(info(), options, async () => currentQuote({ markPrice, delta: null, gamma: '', theta: false, vega: '0', iv: 0, indexPrice: null }));
    expect(quote).toMatchObject({ markPriceUsdt: String(Number(markPrice)), delta: null, gamma: null, theta: null, vega: 0, iv: 0, indexPriceUsdt: null });
    expect(evidence.getFunderOptionSettlementEvidenceError('crypto_option', quote)).toBeNull();
  });
  it.each([{ markPrice: null }, { markPrice: '' }, { markPrice: true }, { markPrice: -1 }, { instrumentName: 'ETH-27NOV26-3600-P' }, { instrumentName: null }, { cacheStale: true }])('缺价/错合约/过期缓存 %j 拒绝', async patch => {
    const quote = await evidence.captureFunderOptionEvidence(info(), options, async () => currentQuote(patch));
    expect(quote.markPriceUsdt).toBeNull();
    expect(evidence.getFunderOptionSettlementEvidenceError('crypto_option', quote)).not.toBeNull();
  });
  it('行情异常安全返回缺证据，不泄漏连接错误；非期权不加门槛', async () => {
    const quote = await evidence.captureFunderOptionEvidence(info(), options, async () => { throw new Error('private connection error'); });
    expect(quote.markPriceUsdt).toBeNull();
    expect(JSON.stringify(quote)).not.toContain('private connection error');
    expect(evidence.getFunderOptionSettlementEvidenceError('crypto', undefined)).toBeNull();
  });
});

describe('登记条款/支付来源元数据：不制造已付额', () => {
  it('保留原始decimal本金、张数、币种和期权条款，不重算利息/分成', () => {
    const source = Object.freeze({ coin: 'ETH', asset_type: 'crypto_option', amount: '1234.5600', amount_currency: 'U', buy_quantity: '48.5000', interest_rate_annual: '8.0000', commission_share: '25%', option_info: JSON.stringify(info()) });
    const saved = evidence.buildFunderRegisteredSettlementEvidence(source, scope);
    expect(saved.registeredTerms).toMatchObject({ amount: '1234.5600', amount_currency: 'U', buy_quantity: '48.5000', commission_share: '25%', option: { buyQty: '48.5', premium: '15.1200' } });
    expect(saved.evidenceScope).toMatchObject({ ...scope, isFinalCashSettlement: false });
    expect(saved.registeredPayments).toMatchObject({ status: 'not_captured', participantUserId: 77, jointSegmentId: 'segment-2', currencyPolicy: 'separate_registered_currencies_no_conversion' });
    expect(saved.registeredPayments).not.toHaveProperty('total');
    expect(saved.registeredTerms).not.toHaveProperty('paidInterest');
    expect(source.amount).toBe('1234.5600');
  });
  it('主拥有者首段NULL、个人首段独立用户、第二段显式用户与段号', () => {
    const main = evidence.buildFunderRegisteredSettlementEvidence({}, { ...scope, userId: 28, jointSegmentId: '__primary__' });
    expect(main.registeredPayments).toMatchObject({ participantUserId: null, jointSegmentId: null });
    const personal = evidence.buildFunderRegisteredSettlementEvidence({}, { ...scope, jointSegmentId: '__primary__' });
    expect(personal.registeredPayments).toMatchObject({ participantUserId: 77, jointSegmentId: null });
    const ownSecond = evidence.buildFunderRegisteredSettlementEvidence({}, { ...scope, userId: 28 });
    expect(ownSecond.registeredPayments).toMatchObject({ participantUserId: 28, jointSegmentId: 'segment-2' });
  });
  it('条款缺失明确null，现有v1/v2对象不被修改', () => {
    for (const version of [1, 2]) {
      const historical = Object.freeze({ version, optionQuote: null, primaryPriceUsdt: '2500' });
      const source = { settlement_snapshot: historical, amount: null, option_info: '{bad' };
      expect(evidence.buildFunderRegisteredSettlementEvidence(source, scope).registeredTerms.amount).toBeNull();
      expect(source.settlement_snapshot).toBe(historical);
      expect(historical).not.toHaveProperty('registeredTerms');
    }
  });
});

// Read/transpile only production function bodies. Every dynamic import is replaced by the
// supplied offline object; router/module top-level initialization never executes.
const source = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('routers.ts', source, ts.ScriptTarget.Latest, true);
function functionNode(name: string) {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing actual production function ${name}`);
  return node as ts.FunctionDeclaration;
}
function actual(name: string, deps: Record<string, any>) {
  const code = ts.transpileModule(functionNode(name).getText(ast).replace(/await import\('[^']+'\)/g, 'await __offlineImport()'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(deps), `${code}; return ${name};`)(...Object.values(deps));
}
function builder(overrides: any = {}) {
  const livePrice = vi.fn((symbol: string) => symbol === 'ETH' ? 2500 : symbol === 'BTC' ? 80000 : 0);
  const fx = vi.fn(async () => 7);
  const auxiliary = vi.fn(async () => undefined);
  const capture = vi.fn(async (optionInfo: any, captureOptions: any) => evidence.captureFunderOptionEvidence(optionInfo, { ...captureOptions, quotedAt: options.quotedAt }, async () => currentQuote()));
  const deps = {
    ...evidence, TRPCError, getBeijingDateString: () => '2026-11-22',
    parseFunderJsonObject: (value: any) => typeof value === 'string' ? JSON.parse(value) : value ?? null,
    parseFunderJsonArray: (value: any) => typeof value === 'string' ? JSON.parse(value) : value ?? [],
    captureFunderOptionSettlementQuote: capture,
    captureFunderManualStockSettlementQuotes: auxiliary, captureFunderExternal37SettlementSnapshot: auxiliary,
    __offlineImport: async () => ({ getLatestPrice: livePrice, refreshUsdtCnyRate: fx, readCurrentStockUsdCnyFreezeEvidence: async () => undefined }),
    ...overrides,
  };
  return { run: actual('buildFunderSettlementSnapshot', deps), livePrice, fx, capture, auxiliary };
}
const sourceOrder = () => ({ coin: 'ETH', asset_type: 'crypto_option', option_info: info(), amount: '730.0000', buy_quantity: '48.5', collateral_assets: [{ coin: 'BTC', qty: '1' }] });

describe('真实结算源码离线回归：必需字段门槛及所有接线', () => {
  it.each([null, '', false, undefined])('live mark %j 缺失，现货价存在也BAD_REQUEST且未读现货', async markPrice => {
    const b = builder({ captureFunderOptionSettlementQuote: async () => ({ ...await evidence.captureFunderOptionEvidence(info(), options, async () => currentQuote({ markPrice })) }) });
    await expect(b.run(sourceOrder(), '2026-11-22', 28, undefined, undefined, undefined, scope)).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('不能用标的现货价替代') });
    expect(b.livePrice).not.toHaveBeenCalled();
  });
  it('当天手填0实际builder冻结manual_confirmed、原始条款且不使用现货冒充合约', async () => {
    const b = builder();
    const saved = await b.run(sourceOrder(), '2026-11-22', 28, undefined, undefined, '0', scope);
    expect(saved).toMatchObject({ version: 2, primaryPriceUsdt: '2500', optionQuote: { markPriceUsdt: '0', source: 'manual_confirmed', delta: null }, registeredTerms: { amount: '730.0000', buy_quantity: '48.5' }, evidenceScope: scope });
  });
  it('历史只冻结手填primary/FX/option，辅币、股票和37当前证据不请求', async () => {
    const b = builder();
    const saved = await b.run(sourceOrder(), '2026-11-21', 28, '2400', '7.2', '0', scope);
    expect(saved.priceBySymbol).toEqual({ USDT: '1', CNY: String(1 / 7.2), ETH: '2400' });
    expect(saved.optionQuote).toMatchObject({ markPriceUsdt: '0', source: 'manual_historical' });
    expect(b.livePrice).not.toHaveBeenCalled(); expect(b.fx).not.toHaveBeenCalled(); expect(b.auxiliary).not.toHaveBeenCalled();
  });
  it('非法当天手填不回退live；非期权原有FX/主价门槛保留', async () => {
    await expect(builder().run(sourceOrder(), '2026-11-22', 28, undefined, undefined, '-1', scope)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const b = builder();
    await expect(b.run({ coin: 'ETH', asset_type: 'crypto' }, '2026-11-21', 28, '0', '7', undefined, scope)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(b.run({ coin: 'ETH', asset_type: 'crypto' }, '2026-11-21', 28, '2400', '0', undefined, scope)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('真实捕获wrapper只以合约身份请求并传结算专用零价标志', async () => {
    const refresh = vi.fn(async (input: any) => currentQuote({ markPrice: '0', instrumentName: input.instrumentName }));
    const run = actual('captureFunderOptionSettlementQuote', { ...evidence, deribitDbGet: async () => null, refreshOptionGreeksQuote: refresh });
    expect((await run(info(), { isHistorical: false })).markPriceUsdt).toBe('0');
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ instrumentName: instrument.instrumentName, settlementEvidence: true }));
  });
  it('四个新快照构建调用都有对应scope且主同步个人也按个人条款捕获', () => {
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'buildFunderSettlementSnapshot') calls.push(node); ts.forEachChild(node, visit); };
    visit(ast);
    expect(calls).toHaveLength(4);
    expect(calls.map(call => call.arguments[6]?.getText(ast))).toEqual([
      expect.stringContaining("sourceKind: 'primary_order'"), expect.stringContaining("userId: targetUserId"),
      expect.stringContaining("jointSegmentId: '__primary__'"), expect.stringContaining('jointSegmentId: segmentId'),
    ]);
    expect(functionNode('buildFunderSettlementSnapshot').getText(ast)).toContain("if (optionEvidenceError) throw new TRPCError({ code: 'BAD_REQUEST'");
    expect(source).toContain('physicalOwnerUserId: Number(updatedOrder.user_id)');
    expect(source).toContain('buildFunderRegisteredSettlementEvidence({ ...buildFunderParticipantSnapshot(updatedOrder), ...snapshot }, {');
  });
  it('已有历史主/个人/联合快照不重建，错误BAD_REQUEST不被主更新包装成500', () => {
    expect(source).toContain("sourceOrder.status === 'settled' || sourceOrder.status === 'completed' || sourceOrder.settlement_snapshot != null");
    expect(source).toContain("personalSnapshot.status === 'settled' || personalSnapshot.status === 'completed' || personalSnapshot.settlement_snapshot != null) continue");
    expect(source).toContain('primaryState.settlement_snapshot == null'); expect(source).toContain('nextSegment.settlement_snapshot == null');
    expect(source).toContain('persistedSnapshot.settlement_snapshot ?? null'); expect(source).toContain('if (e instanceof TRPCError) throw e;');
    expect(source).toContain('p.user_id AS participant_user_id'); expect(source).toContain('Number(segment.owner_user_id) !== input.userId');
  });
  it('主订单源码锁定源行后按实际待写条款生成，未新增payment查询/混币总额', () => {
    const update = source.slice(source.indexOf('let settlementSnapshot: FunderSettlementSnapshot | null = null;'), source.indexOf('// 除周期总息外'));
    expect(update.indexOf('await conn.beginTransaction()')).toBeLessThan(update.indexOf('settlementSnapshot = await buildFunderSettlementSnapshot('));
    expect(update).toContain('LIMIT 1 FOR UPDATE'); expect(update).toContain('settlementSource[column] = updateVals[index]');
    expect(update).not.toContain('ledger_order_payments');
    expect(functionNode('buildFunderSettlementSnapshot').getText(ast)).not.toContain('SUM(');
  });
});

describe('真实报价刷新源码：结算0、nullable Greeks、原币转换', () => {
  function refresher(ticker: any, deribit: any = null) {
    const fetch = vi.fn(async () => deribit ?? { error: { message: 'missing quote' } });
    const run = actual('refreshOptionGreeksQuote', { readFunderEvidenceNumber: evidence.readFunderEvidenceNumber,
      hasUsableOptionMarkPrice: (v: any) => { const n = evidence.readFunderEvidenceNumber(v); return n !== null && n > 0; },
      getGateOptionTicker: async () => { if (ticker instanceof Error) throw ticker; return ticker; },
      deribitDbSet: async () => {}, getDeribitOptionOrderBook: fetch, optionGreeksQuoteRefreshes: new Map() });
    return { run: (settlementEvidence: boolean, cached: any = null) => run({ ...instrument, cached, settlementEvidence }), fetch };
  }
  it('settlementEvidence接收真实Gate0，常规活跃行情仍不以0覆盖正报价', async () => {
    const r = refresher({ mark_price: '0', delta: null, gamma: '', theta: false, vega: '0', mark_iv: 0 });
    expect(await r.run(true)).toMatchObject({ markPrice: 0, delta: null, gamma: null, theta: null, vega: 0, iv: 0 });
    expect(r.fetch).not.toHaveBeenCalled();
    expect(await r.run(false)).toMatchObject({ markPrice: null });
  });
  it('Deribit缺index不能把原币mark装成USDT；极小正数不四舍五入为0', async () => {
    const bad = refresher(new Error('gate unavailable'), { result: { instrument_name: instrument.instrumentName, mark_price: 0.01, index_price: null } });
    expect(await bad.run(true)).toMatchObject({ markPrice: null });
    const small = refresher(new Error('gate unavailable'), { result: { instrument_name: instrument.instrumentName, mark_price: 0.00000001, index_price: 2500, greeks: { delta: null, gamma: '', theta: false, vega: 0 } } });
    expect(await small.run(true)).toMatchObject({ markPrice: 0.000025, delta: null, gamma: null, theta: null, vega: 0 });
  });
  it('Deribit返回别的合约即便合法mark仍缺证据', async () => {
    const wrong = refresher(new Error('gate unavailable'), { result: { instrument_name: 'ETH-27NOV26-3600-P', mark_price: 0.01, index_price: 2500 } });
    expect(await wrong.run(true)).toMatchObject({ markPrice: null });
  });
});
