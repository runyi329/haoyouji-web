import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { finitePositive, getOrderUsdtCnyRate, getUsdtCnyRateFromPrices, formatFxEstimate } from '../shared/usdt-cny-display';
import * as settledDisplay from '../shared/funder-settled-display';

// Execute the actual production helpers/expressions/JSX offline, without importing React/tRPC/DB.
function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
const card = parse('../client/src/components/FunderOrderCard.tsx');
const v2 = parse('../client/src/components/FunderOrderCardV2.tsx');
const detail = parse('../client/src/components/FunderOrderDetailModal.tsx');
function nodes<T extends ts.Node>(root: ts.Node, predicate: (n: ts.Node) => n is T): T[] {
  const result: T[] = [];
  function visit(n: ts.Node) { if (predicate(n)) result.push(n); ts.forEachChild(n, visit); }
  visit(root); return result;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw Error(`Missing production AST: ${name}`);
  return value;
}
function fn(root: ts.Node, name: string) {
  return required(nodes(root, ts.isFunctionDeclaration).find(n => n.name?.text === name), name);
}
function expr(root: ts.Node, name: string) {
  return required(nodes(root, ts.isVariableDeclaration).find(n => n.name.getText() === name)?.initializer, name).getText();
}
function helper(root: ts.Node, name: string) { return fn(root, name).getText().replace(/^export\s+(?:default\s+)?/, ''); }
const old = fn(card, 'FunderOrderCard');
const silver = fn(v2, 'FunderOrderCardV2Silver');
const lender = fn(v2, 'FunderLenderCardSilver');
const modal = fn(detail, 'FunderOrderDetailModal');
const baseHelpers = helper(card, 'readConfirmedExposureGap');
const elements = (tag: unknown, props: any, ...children: any[]) => ({ tag, props: props ?? {}, children });
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree && typeof tree === 'object' && 'children' in tree) return text(tree.children);
  return tree == null || typeof tree === 'boolean' ? '' : String(tree);
}
function run(expression: string, bindings: Record<string, any> = {}, code = baseHelpers): any {
  const forbidden = vi.fn(() => { throw Error('Network/DB forbidden in regression'); });
  const context = createContext({ finitePositive, getOrderUsdtCnyRate, getUsdtCnyRateFromPrices, formatFxEstimate,
    ...settledDisplay,
    useMemo: (factory: () => unknown) => factory(), __element: elements, __fragment: 'fragment',
    fetch: forbidden, trpc: new Proxy({}, { get: forbidden }), ...bindings });
  const compiled = ts.transpileModule(`${code}\n(${expression});`, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
    jsxFactory: '__element', jsxFragmentFactory: '__fragment',
  }}).outputText;
  return new Script(compiled).runInContext(context, { timeout: 1000 });
}
function variables(root: ts.Node, names: string[]) { return names.map(name => `const ${name} = ${expr(root, name)};`).join('\n'); }
const externalMemo = required(nodes(old, ts.isVariableDeclaration).find(n => n.name.getText().includes('extValuationCnyRate:'))?.initializer, 'external valuation memo').getText();
function external(valuation: any, overrides: Record<string, any> = {}) {
  return run(externalMemo, { effectiveCollateralValuation: valuation, isPricingFrozen: false, cnyRate: NaN,
    _extCryptoPricesRaw: { prices: { ETH: 2000 }, usdtCnyRate: null }, linkedPnlTagName: '', linkedCollateralTagName: '担保',
    effectivePnlTagConfig: null, effectivePnlTagSummary: null, effectiveCollateralTagConfig: {}, effectiveCollateralTagSummary: null,
    linkedCollateralMarginRecords: [], linkedCollateralStockQuotes: {}, hasExternalCollateral: true,
    getTagMarginStockMarketValue: () => { throw Error('No stock lookup expected'); }, floatingPnlCalculationMode: 'raw_net_pnl', ...overrides });
}
const riskNames = ['automaticAccruedForRisk', 'linkedPendingInterestForRisk', 'accruedForRisk', 'totalPaidForRisk',
  'linkedPaidInterestForRisk', 'paidInterestForRisk', 'fullValueExposure', 'initialPrincipalExposure',
  'coinNativeCollateralExposure', 'principalLentOutValueForRisk', 'optionExposure', 'exposure'];
const riskDefaults = { cnyRate: NaN, interestRiskUsesCny: false, displayAccrued: 10, displayPaid: 2,
  hasExternalPendingInterest: false, hasExternalPaidInterest: false, linked37PendingInterestCny: null,
  linked37PaidInterestCny: null, signedMarketValueForFullValueRisk: 150, initialFinancingPrincipalU: 100,
  combinedCollateralValueU: 120, collateralGapBaseForRisk: 100, isOptionOrder: false,
  usesCoinNativeCollateralFormula: false, usesInitialPrincipalFormula: false, usesPrincipalCoverageFormula: true,
  usesFloatingPnlFormula: false, formulaFloatingPnlU: 50 };
function risk(overrides: Record<string, any> = {}, value = 'exposure') {
  return run(value, { ...riskDefaults, ...overrides }, `${baseHelpers}\n${variables(old, riskNames)}`);
}

describe('canonical null is unknown, not a zero guarantee or margin ratio', () => {
  it.each([null, undefined, '', NaN, Infinity, -Infinity, false, ' '])('strict production reader rejects %s', value => {
    expect(run('readConfirmedExposureGap(value)', { value })).toBeNull();
  });
  it.each([0, '0', -1, '12.5'])('confirmed finite %s survives', value => {
    expect(run('readConfirmedExposureGap(value)', { value })).toBe(Number(value));
  });
  it('external valuation does not turn canonical null into 0 or recompute a partial sum', () => {
    const value = external({ totalCny: null, usdtCnyRate: null });
    expect(value.extCollateralValueCny).toBeNull(); expect(value.extCollateralValueU).toBeNull();
    expect(external({ totalCny: 0, usdtCnyRate: null }).extCollateralValueCny).toBe(0);
  });
  it.each([card, v2])('referenced margin %s executes the canonical null guard without FX', ast => {
    const isOld = ast === card;
    const bindings = isOld
      ? { hasExternalMarginRateReference: true, effectiveMarginRateValuation: { totalCny: null },
          effectiveMarginRateTagSummary: { latestBalance: { balance: 1000 } }, effectiveMarginRateTagConfig: { initial_amount: 500, margin_base: 100 } }
      : { hasExternalMarginRateReference: true, _canonicalMarginRateValuation: { totalCny: null },
          _marginRateTagSummary: { latestBalance: { balance: 1000 } }, _marginRateTagConfig: { initial_amount: 500, margin_base: 100 } };
    const expression = expr(isOld ? old : silver, isOld ? 'referencedMarginRate' : 'referencedMarginRatePct');
    const unknown = run(expression, bindings);
    expect(isOld ? unknown.percent : unknown).toBeNull();
    const known = run(expression, { ...bindings, [isOld ? 'effectiveMarginRateValuation' : '_canonicalMarginRateValuation']: { totalCny: 0 } });
    expect(isOld ? known.percent : known).toBe(500);
  });
});

describe('CNY primary guarantee and original quantities do not depend on auxiliary U valuation', () => {
  const row = required(nodes(old, ts.isConditionalExpression).find(n => n.condition.getText().includes("externalCollateralDisplayMode === 'CRYPTO'")), 'primary guarantee JSX');
  it('canonical CNY primary renders while its U reference is unknown', () => {
    const values = external({ totalCny: 6714, usdtCnyRate: null });
    expect(values.extCollateralValueCny).toBe(6714); expect(values.extCollateralValueU).toBeNull();
    const rendered = run(row.getText(), { externalCollateralDisplayMode: 'CNY', externalOnlyCollateralValueU: null,
      extTagCollateralValueCny: values.extCollateralValueCny, cnyRate: NaN, isSharedMode: false, externalCollateralDetailRows: [] });
    expect(text(rendered)).toContain('6,714'); expect(text(rendered)).toContain('元'); expect(text(rendered)).not.toContain('加载');
  });
  it('U primary stays pending but raw coin quantities render without FX', () => {
    const bindings = { externalOnlyCollateralValueU: null, extTagCollateralValueCny: 6714, cnyRate: NaN, isSharedMode: false,
      externalCollateralDetailRows: ['ETH × 3.5'] };
    expect(text(run(row.getText(), { ...bindings, externalCollateralDisplayMode: 'U' }))).toContain('加载');
    expect(text(run(row.getText(), { ...bindings, externalCollateralDisplayMode: 'CRYPTO' }))).toContain('ETH × 3.5');
  });
  it('CNY account value remains original even when U conversion is missing', () => {
    const result = external({ totalCny: 10, usdtCnyRate: null }, { linkedPnlTagName: '净值', effectivePnlTagConfig: { initial_amount: 100 },
      effectivePnlTagSummary: { currentHoldingValue: { value: 500 } } });
    expect(result.extHoldingValueCny).toBe(500); expect(result.extHoldingValueU).toBeNull();
  });
});

describe('only actual mixed-currency risk dependencies wait for FX', () => {
  it('pure U principal coverage, floating PnL, full value and initial principal calculate without FX', () => {
    expect(risk()).toBe(12);
    expect(risk({ usesPrincipalCoverageFormula: false, usesFloatingPnlFormula: true })).toBe(162);
    expect(risk({ usesPrincipalCoverageFormula: false })).toBe(142);
    expect(risk({ usesInitialPrincipalFormula: true })).toBe(-108);
    expect(risk({ isOptionOrder: true })).toBe(12);
  });
  it('mixed CNY/U interest or collateral never becomes 0 or NaN risk', () => {
    expect(risk({ interestRiskUsesCny: true })).toBeNull();
    expect(risk({ combinedCollateralValueU: null })).toBeNull();
    expect(risk({ hasExternalPendingInterest: true })).toBeNull();
    expect(risk({ hasExternalPaidInterest: true })).toBeNull();
    expect(risk({ collateralGapBaseForRisk: NaN })).toBeNull();
  });
  it('coin-native collateral excludes principal and all interest, even unknown external interest', () => {
    expect(risk({ usesCoinNativeCollateralFormula: true, interestRiskUsesCny: true, hasExternalPendingInterest: true })).toBe(120);
    expect(risk({ usesCoinNativeCollateralFormula: true, combinedCollateralValueU: null })).toBeNull();
  });
  it('referenced collateral-only risk ignores unrelated unknown CNY interest', () => {
    expect(run(expr(old, 'externalNonSharedGapU'), { usesConfiguredStockRiskData: true, usesCoinNativeCollateralFormula: true,
      linkedPendingInterestForRisk: null, linkedPaidInterestForRisk: null, linkedCollateralValueU: 120, cnyRate: NaN })).toBe(120);
  });
  it('actual collateral loop values USDT and ETH without CNY FX; mixed CNY blocks the total', () => {
    const loop = required(nodes(old, ts.isForOfStatement).find(n => n.expression.getText() === 'collateralAssets'), 'collateral valuation loop');
    const code = `${baseHelpers}\nlet collateralValue=0; let collateralValueKnown=true; const collateralItemValues=[]; const collateralItemPrices=[];\n${loop.getText()}\nconst localWalletCollateralValueU=${expr(old, 'localWalletCollateralValueU')};`;
    const inputs = { cnyRate: NaN, livePrices: { ETH: 2000 }, collateralAssets: [{ coin: 'USDT', qty: '100' }, { coin: 'ETH', qty: '2' }] };
    expect(run('localWalletCollateralValueU', inputs, code)).toBe(4100);
    expect(run('localWalletCollateralValueU', { ...inputs, collateralAssets: [...inputs.collateralAssets, { coin: 'CNY', qty: '100' }] }, code)).toBeNull();
  });
  it('shared order risk and formula preview use known U inputs rather than globally requiring FX', () => {
    const bindings = { cnyRate: NaN, sharedOrderUsesCoinNativeCollateral: false, sharedOrderCollateralValueU: 120,
      usesInitialPrincipalFormula: false, isOptionOrder: false, sharedOrderUsesPrincipalCoverage: true,
      sharedOrderBorrowedValueU: 100, sharedOrderPendingInterestU: 10, sharedOrderPaidInterestU: 2, sharedOrderUsesFloatingPnl: false };
    expect(run(expr(old, 'sharedOrderExposure'), bindings)).toBe(12);
    const preview = run(expr(old, 'collateralFormulaPreview'), { ...riskDefaults, isSharedMode: false, usesConfiguredStockRiskData: false,
      linkedCollateralValueU: null, principalLentOutValueForRisk: 100, accruedForRisk: 10, paidInterestForRisk: 2,
      ...bindings, sharedOrderFloatingPnlU: 50, linkedFloatingPnlU: 50, linkedPendingInterestForRisk: 10, linkedPaidInterestForRisk: 2 });
    expect(preview.principalCoverageGapU).toBe(12); expect(preview.floatingPnlGapU).toBe(162);
    expect(preview.fullValueGapU).toBe(142); expect(preview.initialPrincipalGapU).toBe(-108); expect(preview.coinNativeCollateralGapU).toBe(120);
    expect(run(expr(old, 'showExposureLoading'), { effectiveExposure: 12, cnyRate: NaN })).toBe(false);
  });
  it('margin display guard only checks its actual numerator and denominator, not FX globally', () => {
    const guard = required(nodes(old, ts.isIfStatement).find(n => n.expression.getText().startsWith('!canShowMarginRate')), 'margin display guard');
    const bindings = { canShowMarginRate: true, usesExternalMarginRate: false, marginRateNumerator: 12, marginRateBaseU: 100, cnyRate: NaN };
    expect(run(guard.expression.getText(), bindings)).toBe(false);
    expect(run(guard.expression.getText(), { ...bindings, marginRateNumerator: null })).toBe(true);
    expect(run(guard.expression.getText(), { ...bindings, marginRateBaseU: NaN })).toBe(true);
  });
  it('same-U confirmed gap callback remains publishable with missing FX', () => {
    const effect = required(nodes(old, ts.isCallExpression).find(n => n.expression.getText() === 'useEffect'
      && n.arguments[0]?.getText().includes('onExposureGapChange(canonicalOrderId, finalGap, combinedCollateralValueU)')), 'gap callback effect');
    const callback = vi.fn();
    run(`(${effect.arguments[0].getText()})()`, { onExposureGapChange: callback, cnyRate: NaN, order: { id: 52 },
      hasExternalCollateral: false, isSharedMode: false, exposure: 12, externalNonSharedGapU: null, combinedCollateralValueU: 120 });
    expect(callback).toHaveBeenCalledWith(52, 12, 120);
  });
  it.each([silver, lender])('V2 risk no longer invents 6.8 or coerces NaN to known gap', root => {
    const isSilver = root === silver;
    const code = `${baseHelpers}\n${variables(root, isSilver ? ['silverRiskCnyRate','silverAccruedInterestU','silverPaidInterestU','silverCoverageBaseU','exposure','finalExposureGapU'] : ['effectiveCnyRate','accruedInU','paidInU','lenderCoverageBaseU','collateralGap','lenderFinalGapU'])}`;
    const bindings = { cnyRate: NaN, interestUnit: 'U', displayAccrued: 10, displayPaid: 2, buyValue: 100, storedAmountUsdt: 100,
      cardUsesCoinNativeCollateral: false, cardUsesInitialPrincipal: false, cardUsesPrincipalCoverage: true, cardUsesFloatingPnl: false,
      _isOptCard: false, localWalletCollateralValueU: 120, cardInitialFinancingPrincipalU: 100,
      lenderUsesCoinNativeCollateral: false, lenderUsesInitialPrincipal: false, lenderUsesPrincipalCoverage: true,
      lenderUsesFloatingPnl: false, _lnIsOpt: false, collateralValue: 120, initialFinancingPrincipalU: 100,
      hasExternalCollateral: false };
    const name = isSilver ? 'finalExposureGapU' : 'lenderFinalGapU';
    expect(run(name, bindings, code)).toBe(12);
    expect(run(name, { ...bindings, interestUnit: '元' }, code)).toBeNull();
    expect(run(name, { ...bindings, buyValue: NaN, storedAmountUsdt: NaN }, code)).toBeNull();
  });
});

describe('same-currency interest and frozen history are independent of current FX', () => {
  it.each([old, silver, lender])('actual interest conversion keeps same currency %s', root => {
    for (const currency of ['USDT','CNY']) {
      expect(run(`(${expr(root, 'convertAccrued')})(25)`, { baseCur: currency, rateCur: currency, cnyRate: NaN })).toBe(25);
    }
    expect(run(`(${expr(root, 'convertAccrued')})(25)`, { baseCur: 'USDT', rateCur: 'CNY', cnyRate: NaN })).toBeNaN();
  });
  it('modal same-currency interest is visible and only its alternate amount waits', () => {
    expect(run(expr(modal, 'displayAccrued'), { accrued: 25, baseCurrency: 'USDT', rateCurrency: 'USDT', cnyRate: NaN })).toBe(25);
    expect(run(expr(modal, 'alternateAccrued'), { displayAccrued: 25, rateCurrency: 'USDT', cnyRate: NaN })).toBeNaN();
  });
  const frozenHelpers = `${baseHelpers}\n${helper(v2, 'getFunderCardDisplayInputs')}\n${helper(v2, 'getFunderFrozenExternalTag')}`;
  it.each([null, '{}', '{broken', JSON.stringify({ usdtCnyRate: null, priceBySymbol: { ETH: null } })])('frozen %s never reads live FX or ETH', settlement_snapshot => {
    const result = run('getFunderCardDisplayInputs(order, prices, rate)', { order: { status: 'settled', coin: 'ETH', settlement_snapshot }, prices: { ETH: 9999 }, rate: 6.8 }, frozenHelpers);
    expect(result.cnyRate).toBeNaN(); expect(result.livePrices.ETH).toBeUndefined(); expect(result.livePrices.USDT).toBe(1);
  });
  it('stored snapshots preserve historical FX, external valuation and a consistent risk calculation', () => {
    const order = Object.freeze({ status: 'completed', coin: 'ETH', settlement_snapshot: JSON.stringify({ usdtCnyRate: 7,
      priceBySymbol: { ETH: 2000 }, external37: { tags: { 担保: { marginValuation: { totalCny: 700, usdtCnyRate: 7 } } } } }) });
    const before = JSON.stringify(order);
    const values = run('getFunderCardDisplayInputs(order, prices, rate)', { order, prices: { ETH: 9999 }, rate: 6.8 }, frozenHelpers);
    expect(values.cnyRate).toBe(7); expect(values.livePrices.ETH).toBe(2000);
    expect(external({ totalCny: 700, usdtCnyRate: 7 }, { isPricingFrozen: true, cnyRate: values.cnyRate }).extCollateralValueU).toBe(100);
    expect(risk({ cnyRate: values.cnyRate, interestRiskUsesCny: true, displayAccrued: 70, displayPaid: 14 })).toBe(12);
    expect(JSON.stringify(order)).toBe(before);
  });
  it('old card frozen rate and option quote do not fill missing history from live cache', () => {
    expect(run(expr(old, 'cnyRate'), { isPricingFrozen: true, settlementSnapshot: { usdtCnyRate: null }, _cnyRateData: { success: true, money: 7 } })).toBeNaN();
    const quote = run(expr(old, 'optionGreeksData'), { isPricingFrozen: true, settlementSnapshot: { optionQuote: { markPriceUsdt: null } }, greeksResult: { data: { markPrice: 999 } } });
    expect(quote.markPrice).toBeNull();
    expect(run(expr(old, 'isPricingFrozen'), { isSettlementFinal: true, hasSettlementSnapshot: false })).toBe(true);
  });
  it('original stock financing remains visible without FX; same-currency period interest stays exact', () => {
    const helpers = `${baseHelpers}\n${helper(v2, 'getExactFinancingDisplayAmount')}\n${helper(v2, 'getPeriodInterestTotal')}`;
    expect(run('getExactFinancingDisplayAmount(order, "CNY", NaN)', { order: { asset_type: 'stock', amount: '6714' } }, helpers)).toBe(6714);
    expect(run('getPeriodInterestTotal({periodInterestTotal:true},1200,12,"USDT","USDT",NaN)', {}, helpers).value).toBe(12);
    expect(run('getPeriodInterestTotal({periodInterestTotal:true},1200,12,"USDT","CNY",NaN)', {}, helpers).value).toBeNaN();
  });
});
