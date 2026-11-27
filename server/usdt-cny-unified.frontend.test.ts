import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as fx from '../shared/usdt-cny-display';
import { buildWalletDigitalAssets, formatDigitalAssetAmount } from '../client/src/lib/walletDigitalAssets';
import { getWalletCollateralDraftError } from '../shared/funder-wallet-collateral-input';

const paths = ['pages/FunderManagement', 'pages/LedgerDetail', 'pages/PositionCalc', 'pages/AfFeeDetail',
  'pages/FinanceManagement', 'pages/Wallet', 'components/FunderOrderCard', 'components/FunderOrderDetailModal', 'pages/OrderFlowPage'];
const sources = Object.fromEntries(paths.map(name => [name, ts.createSourceFile(`${name}.tsx`,
  readFileSync(new URL(`../client/src/${name}.tsx`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)]));
function nodes<T extends ts.Node>(root: ts.Node, guard: (n: ts.Node) => n is T): T[] {
  const results: T[] = []; const visit = (n: ts.Node) => { if (guard(n)) results.push(n); ts.forEachChild(n, visit); };
  visit(root); return results;
}
function required<T>(value: T | undefined, label: string): T { if (value === undefined) throw new Error(`Missing production AST: ${label}`); return value; }
function initial(name: string, key: string, index = 0) {
  const ast = sources[key]; return required(nodes(ast, ts.isVariableDeclaration).filter(n => ts.isIdentifier(n.name) && n.name.text === name)[index]?.initializer, `${key}.${name}`);
}
function evaluate<T>(code: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(code, { fileName: 'fx-offline.tsx', compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } });
  return runInNewContext(outputText, { ...fx, ...bindings }, { timeout: 1000 }) as T;
}
function expression<T>(name: string, key: string, bindings: Record<string, unknown> = {}, index = 0): T {
  return evaluate(`(${initial(name, key, index).getText(sources[key])});`, bindings);
}
const quote = (rate: unknown = 6.7, extra = {}) => ({ success: true, money: String(rate), rate, stale: false, ...extra });
const metadata = (rate: unknown = 6.7, extra = {}) => ({ pair: 'USDT/CNY', rate, stale: false,
  source: 'coingecko_tether_cny', asOf: '2026-11-21T06:53:54Z', ...extra });
const prices = (rate: unknown = 6.7, extra = {}) => ({ prices: { ETH: 2000 }, usdtCnyRate: rate, usdtCnyFx: metadata(rate, extra) });
const bad = [undefined, null, {}, quote(0), quote(-1), quote(NaN), quote(Infinity), quote(6.7, { stale: true }), quote(6.7, { success: false })];

type VNode = { type: unknown; props: Record<string, any>; children: unknown[] };
const React = { Fragment: 'Fragment', createElement: (type: unknown, props: Record<string, any> | null, ...children: unknown[]): VNode => ({ type, props: props ?? {}, children }) };
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object' && 'children' in node) return (node as VNode).children.map(text).join('');
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function attr(node: ts.JsxSelfClosingElement | ts.JsxElement, name: string) {
  const attrs = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
  return attrs.find((v): v is ts.JsxAttribute => ts.isJsxAttribute(v) && v.name.getText() === name);
}
function attrExpr(node: ts.JsxSelfClosingElement | ts.JsxElement, name: string) {
  const value = required(attr(node, name)?.initializer, name);
  if (!ts.isJsxExpression(value) || !value.expression) throw new Error(`No expression ${name}`);
  return value.expression;
}

describe('USDT/CNY display contract: missing/zero/non-finite/stale never a usable conversion', () => {
  it.each(bad.map((value, i) => [i, value]))('reject invalid quote %s', (_index, value) => expect(fx.getUsdtCnyRate(value)).toBeNull());
  it('legitimate live 6.7 is usable, money compatibility retained, invalid explicit rate is not repaired', () => {
    expect(fx.getUsdtCnyRate(quote())).toBe(6.7);
    expect(fx.getUsdtCnyRate({ success: true, money: '6.7' })).toBe(6.7);
    expect(fx.getUsdtCnyRate({ success: true, money: '6.7', rate: 0 })).toBeNull();
  });
  it('明确美元与USDT身份不能混用，两个解析器使用各自币种', () => {
    const usd = quote(6.6714, { pair: 'USD/CNY', fromcoin: 'USD' });
    const usdt = quote(6.692, { pair: 'USDT/CNY', fromcoin: 'USDT' });
    expect(fx.getUsdtCnyRate(usd)).toBeNull(); expect(fx.getUsdCnyRate(usdt)).toBeNull();
    expect(fx.getUsdCnyRate(usd)).toBe(6.6714); expect(fx.getUsdtCnyRate(usdt)).toBe(6.692);
  });
  it('真实取数时刻过期或未来必须未知，不无限延用客户端旧成功data', () => {
    expect(fx.getUsdtCnyRate(quote(6.7, { observedAt: new Date(Date.now() - 120_001).toISOString() }))).toBeNull();
    expect(fx.getUsdtCnyRate(quote(6.7, { observedAt: new Date(Date.now() + 60_000).toISOString() }))).toBeNull();
    expect(fx.getUsdtCnyRateFromPrices(prices(6.7, { observedAt: new Date(Date.now() - 120_001).toISOString() }))).toBeNull();
  });
  it('展示汇率与来源报价不一致或换算溢出必须未知', () => {
    expect(fx.getUsdtCnyRateFromPrices({ ...prices(6.7), usdtCnyRate: 7.25 })).toBeNull();
    expect(fx.usdtToCny(Number.MAX_VALUE, 6.7)).toBeNull();
    expect(fx.cnyToUsdt(Number.MAX_VALUE, Number.MIN_VALUE)).toBeNull();
  });
  it('getCryptoPrices metadata has no success wrapper: reliable quote accepted, stale/bare/false rejected', () => {
    expect(fx.getUsdtCnyRateFromPrices(prices())).toBe(6.7);
    for (const data of [undefined, { usdtCnyRate: 6.7 }, prices(0), prices(NaN), prices(6.7, { stale: true }), prices(6.7, { success: false })])
      expect(fx.getUsdtCnyRateFromPrices(data)).toBeNull();
  });
  it('frozen snapshots are not replaced or filled by live quotes', () => {
    expect(fx.getOrderUsdtCnyRate(true, 6.7, quote(7.4))).toBe(6.7);
    expect(fx.getOrderUsdtCnyRate(true, null, quote(7.4))).toBeNull();
    expect(fx.getOrderUsdtCnyRate(false, 6.7, quote(7.4))).toBe(7.4);
  });
  it('manual valid payment rate works during outage; invalid nonblank input cannot be silently repaired', () => {
    expect(fx.resolveUsdtCnyPaymentRate('6.7', null)).toBe(6.7);
    for (const value of ['', '0', 'NaN', 'Infinity', '-1']) expect(fx.resolveUsdtCnyPaymentRate(value, null)).toBeNull();
    expect(fx.resolveUsdtCnyPaymentRate('0', 6.7)).toBeNull();
  });
  it('unknown cannot divide by zero or become deterministic zero, known conversions and real zero preserved', () => {
    for (const rate of [null, undefined, 0, NaN, Infinity]) {
      expect(fx.cnyToUsdt(67, rate)).toBeNull(); expect(fx.usdtToCny(10, rate)).toBeNull();
    }
    expect(fx.cnyToUsdt(67, 6.7)).toBe(10); expect(fx.usdtToCny(10, 6.7)).toBe(67);
    expect(fx.usdtToCny(0, 6.7)).toBe(0);
    for (const amount of [null, undefined, NaN, Infinity]) expect(fx.formatFxEstimate(amount, 'toFixed', 2)).toContain('待更新');
    expect(fx.formatFxEstimate(0, 'toFixed', 2)).toBe('0.00');
  });
});

describe('actual production TSX/AST input, wiring and execution', () => {
  it('every target TSX parses and actual exchange useQuery executes with explicit USDT; real USD stock query stays USD', () => {
    const seen: string[] = [];
    for (const [key, ast] of Object.entries(sources)) {
      expect((ast as any).parseDiagnostics).toEqual([]);
      for (const call of nodes(ast, ts.isCallExpression).filter(n => n.expression.getText(ast) === 'trpc.exchange.getRate.useQuery')) {
        const input = evaluate<any>(`(${call.arguments[0].getText(ast)});`);
        const useQuery = vi.fn(); evaluate(`trpc.exchange.getRate.useQuery(${call.arguments[0].getText(ast)});`, { trpc: { exchange: { getRate: { useQuery } } } });
        expect(useQuery).toHaveBeenCalledWith(input);
        expect(input).toMatchObject({ tocoin: 'CNY', money: 1 });
        expect(['USDT', 'USD']).toContain(input.fromcoin);
        if (input.fromcoin === 'USD') expect(key).toBe('components/FunderOrderCard');
        seen.push(input.fromcoin);
      }
    }
    // Wallet now subscribes to independent FX instead of requesting the full coin-price directory for conversion.
    expect(seen.filter(v => v === 'USDT')).toHaveLength(10);
    expect(seen.filter(v => v === 'USD')).toHaveLength(1);
  });
  it('production live cnyRate extractors reject outage and valid 6.7 passes; frozen card strictly selects snapshot', () => {
    for (const key of ['pages/FunderManagement', 'pages/LedgerDetail', 'pages/AfFeeDetail', 'pages/FinanceManagement']) {
      for (const input of bad) expect(Number.isFinite(expression('cnyRate', key, { cnyRateData: input, _cnyRateData: input }))).toBe(false);
      expect(expression('cnyRate', key, { cnyRateData: quote(), _cnyRateData: quote() })).toBe(6.7);
    }
    const card = 'components/FunderOrderCard';
    expect(expression('cnyRate', card, { isPricingFrozen: true, settlementSnapshot: { usdtCnyRate: 6.7 }, _cnyRateData: quote(7.4) })).toBe(6.7);
    expect(Number.isFinite(expression('cnyRate', card, { isPricingFrozen: true, settlementSnapshot: {}, _cnyRateData: quote(7.4) }))).toBe(false);
  });
  it('production FunderManagement conversion helpers preserve native USDT, unknown CNY is null not Infinity', () => {
    const key = 'pages/FunderManagement';
    const to = expression<(n: number, cur: string) => number | null>('toUsdtBase', key, { cnyRate: NaN, formLivePrices: {} });
    const from = expression<(n: number, cur: string) => number | null>('fromUsdtBase', key, { cnyRate: NaN, formLivePrices: {} });
    expect(to(10, 'USDT')).toBe(10); expect(from(10, 'USDT')).toBe(10);
    expect(to(67, 'CNY')).toBeNull(); expect(from(10, 'CNY')).toBeNull();
    expect(expression<any>('toUsdtBase', key, { cnyRate: 6.7, formLivePrices: {} })(67, 'CNY')).toBe(10);
  });
  it('PositionCalc and OrderFlow effects clear stale real rate, not indefinitely carry it', () => {
    for (const key of ['pages/PositionCalc', 'pages/OrderFlowPage']) {
      const ast = sources[key]; const effect = required(nodes(ast, ts.isCallExpression).find(n => n.expression.getText(ast) === 'useEffect'
        && n.arguments[0]?.getText(ast).includes('getUsdtCnyRate(rateData)')), key);
      for (const rateData of [quote(), quote(6.7, { stale: true }), undefined]) {
        const setCnyRate = vi.fn(); evaluate<() => void>(`(${effect.arguments[0].getText(ast)});`, { rateData,
          setCnyRate, setRateFromApi: vi.fn(), manualCnyRate: null, editingRate: false })();
        const rate = setCnyRate.mock.calls[0][0]; expect(Number.isFinite(rate)).toBe(rateData?.stale === false);
      }
    }
  });
  it('PositionCalc unknown target cannot derive a fake zero-profit exit/save estimate', () => {
    const computed = expression('computedTargetExitPrice', 'pages/PositionCalc', { useMemo: (f: () => unknown) => f(), cnyRate: NaN,
      targetProfitCny: '670', targetEthQty: '1', planned: { 2000: 1 }, priceLevels: [2000] });
    expect(Number.isFinite(computed)).toBe(false);
  });
  it('actual interest payment/edit callbacks block missing FX but manually entered 6.7 still submits unchanged native amount', () => {
    for (const key of ['components/FunderOrderCard', 'pages/LedgerDetail']) {
      const ast = sources[key]; const callbacks = nodes(ast, ts.isJsxAttribute).filter(n => n.name.getText(ast) === 'onClick'
        && n.initializer?.getText(ast).includes('resolveUsdtCnyPaymentRate') && n.initializer?.getText(ast).includes('.mutate'));
      expect(callbacks.length).toBeGreaterThan(0);
      for (const attribute of callbacks) {
        const callback = (attribute.initializer as ts.JsxExpression).expression!;
        for (const rate of ['', '0', 'NaN', '6.7']) {
          const mutate = vi.fn(), toast = { error: vi.fn() }; const form = { amount: '10', currency: 'U', exchangeRate: rate, payDate: '2026-11-21', note: '' };
          evaluate<() => void>(`(${callback.getText(ast)});`, { cnyRate: NaN, paymentForm: form, $paymentForm: form, editPaymentForm: form,
            ledgerId: 52, order: { id: 17 }, p: { id: 3 }, toast, addPaymentMutation: { mutate }, $addPaymentMutation: { mutate }, _intUpdatePaymentMutation: { mutate },
            selectedJointPaymentSegmentId: null, selectedJointPaymentUserId: null, _participantUserId: undefined })();
          if (rate === '6.7') expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ amount: 10, exchangeRate: 6.7, currency: 'U' }));
          else { expect(mutate).not.toHaveBeenCalled(); expect(toast.error).toHaveBeenCalled(); }
        }
      }
    }
  });
  it('LedgerDetail未初始化付款表单时安全提示且不提交', () => {
    const ast = sources['pages/LedgerDetail'];
    const attribute = nodes(ast, ts.isJsxAttribute).find(n => n.name.getText(ast) === 'onClick'
      && n.initializer?.getText(ast).includes('resolveUsdtCnyPaymentRate') && n.initializer?.getText(ast).includes('.mutate'))!;
    const callback = (attribute.initializer as ts.JsxExpression).expression!;
    const mutate = vi.fn(), toast = { error: vi.fn() };
    expect(() => evaluate<() => void>(`(${callback.getText(ast)});`, {
      paymentForm: undefined, cnyRate: 6.7, toast, addPaymentMutation: { mutate }, ledgerId: 52, order: { id: 17 },
    })()).not.toThrow();
    expect(mutate).not.toHaveBeenCalled(); expect(toast.error).toHaveBeenCalledWith('请填写结息金额');
  });
  it('actual non-stock CNY financing submit is blocked before any mutation when FX missing', () => {
    const mutate = vi.fn(), toast = { error: vi.fn() };
    const fn = expression<() => void>('handleSubmit', 'pages/FunderManagement', { cnyRate: NaN,
      formData: { assetType: 'crypto', amountCurrency: 'CNY' }, optionFormData: {}, toast,
      ledgerId: 52, editingOrder: null, collateralAssets: [], walletCollateralAmountsReady: false,
      createdOrderRecovery: null, newOrderCreateContextRef: { current: null }, newOrderEditorScopeRef: { current: 1 },
      walletCollateralBalancesQuery: { data: undefined }, getWalletCollateralDraftError,
      createMutation: { mutate, isPending: false }, financeCreateMutation: { mutate, isPending: false },
      updateMutation: { mutate, isPending: false }, updateParticipantOrderMutation: { mutate, isPending: false },
      saveJointOrderSegmentsMutation: { mutate, isPending: false }, saveWalletCollateralMutation: { mutate, isPending: false } });
    fn(); expect(mutate).not.toHaveBeenCalled(); expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('汇率待更新'));
  });
  it('52 wallet absent FX is unknown but keeps original CNY/USDT totals and independent frozen-only coin quantities', () => {
    const key = 'pages/Wallet'; const query = { data: quote(6.7, { stale: true, pair: 'USDT/CNY', fromcoin: 'USDT' }) };
    const valuation = expression<any>('walletFxValuation', key, { usdtTotalBalance: 100, cnyBalance: 670, walletFxQuery: query });
    expect(valuation).toMatchObject({ rate: null, usdtTotal: 100, cnyTotal: 670, usdtValueCny: null, cnyValueUsdt: null });
    const raw = [{ assetCode: 'ETH', totalBalance: 2, availableBalance: 0, frozenBalance: 2, priceUsdt: 99999 }];
    const mapped = expression<any[]>('multiAssetBalances', key, { multiAssetBalancesQuery: { data: raw }, unifiedPrices: {}, usdtCnyRate: null });
    expect(mapped[0]).toMatchObject({ totalBalance: 2, availableBalance: 0, frozenBalance: 2, priceUsdt: 0, priceCny: null });
    const visible = buildWalletDigitalAssets({ total: 100, available: 80, frozen: 20 }, mapped);
    const declaration = required(nodes(sources[key], ts.isFunctionDeclaration).find(n => n.name?.text === 'WalletFxAssetList'), 'wallet fallback');
    const render = evaluate<(args: unknown) => VNode>(`(${declaration.getText(sources[key]).replace(/^export\s+/, '')});`, { React, buildWalletDigitalAssets,
      formatDigitalAssetAmount, WalletDigitalAssetList: 'WalletDigitalAssetList', G: { divider: '', white: '', whiteDim: '' } });
    const content = text(render({ assets: visible, usdtCnyRate: null, mask: (s: string) => s }));
    expect(content).toContain('100.00 USDT'); expect(content).toContain('ETH'); expect(content).toContain('担保 2');
    expect(content).toContain('人民币估值/汇率待更新'); expect(content).not.toMatch(/NaN|Infinity|¥0/);
    const cryptoCard = required(nodes(sources[key], ts.isJsxSelfClosingElement).find(n => n.tagName.getText() === 'AccountCard'
      && attr(n, 'label')?.initializer?.getText() === '"数字币账户"'), 'digital card');
    expect(evaluate(`(${attrExpr(cryptoCard, 'balance').getText(sources[key])});`, { mask: (s: string) => s, digitalValuationKnown: false, digitalTotalUsdt: 100, isMibanWalletEntry: false })).toBe('估值待更新');
    expect(evaluate(`(${attrExpr(cryptoCard, 'subLine').getText(sources[key])});`, { React, hideBalance: false, cnyValuationKnown: false,
      digitalTotalUsdt: 100, usdtCnyRate: null, G: {} })).toMatchObject({ type: 'div' });
    expect(text(evaluate(`(${attrExpr(cryptoCard, 'subLine').getText(sources[key])});`, { React, hideBalance: false, cnyValuationKnown: false,
      digitalTotalUsdt: 100, usdtCnyRate: null, G: {} }))).toBe('人民币估值待更新');
    const cnyCard = required(nodes(sources[key], ts.isJsxSelfClosingElement).find(n => n.tagName.getText() === 'AccountCard'
      && attr(n, 'label')?.initializer?.getText() === '"人民币账户"'), 'CNY card');
    expect(evaluate(`(${attrExpr(cnyCard, 'balance').getText(sources[key])});`, { cnyBalance: 670, mask: (s: string) => s })).toBe('670.00');
  });
  it('frozen card risk becomes unknown rather than deterministic zero when historical FX missing', () => {
    const key = 'components/FunderOrderCard';
    const helper = required(nodes(sources[key], ts.isFunctionDeclaration).find(n => n.name?.text === 'readConfirmedExposureGap'), 'actual exposure normalizer');
    const readConfirmedExposureGap = evaluate<(value: unknown) => number | null>(`(${helper.getText(sources[key])});`);
    // 真实冻结混币缺口的上游值未知；装配新增helper，而不是删掉null安全断言。
    const bindings = { cnyRate: NaN, readConfirmedExposureGap, isOptionOrder: true, optionExposure: NaN,
      sharedOrderUsesCoinNativeCollateral: false, usesInitialPrincipalFormula: false };
    const exposure = expression('exposure', key, bindings);
    expect(exposure).toBeNull();
    expect(expression('sharedOrderExposure', key, bindings)).toBeNull();
  });
});
