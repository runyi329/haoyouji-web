import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { finitePositive, getUsdtCnyRateFromPrices } from '../shared/usdt-cny-display';
import { readLedgerTagHoldingValue } from '../client/src/lib/ledgerTagHoldingValue';

// 只执行真实生产表达式；不导入卡片模块，因此不初始化 React/tRPC/数据库。
function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (n: ts.Node) => n is T): T[] {
  const found: T[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(root);
  return found;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw Error(`Missing production AST: ${name}`);
  return value;
}
function fn(root: ts.Node, name: string) {
  return required(nodes(root, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
}
function expr(root: ts.Node, name: string) {
  return required(nodes(root, ts.isVariableDeclaration).find(node => node.name.getText() === name)?.initializer, name).getText();
}
function destructuredExpr(root: ts.Node, key: string) {
  return required(nodes(root, ts.isVariableDeclaration).find(node => node.name.getText().includes(key))?.initializer, key).getText();
}
const card = parse('../client/src/components/FunderOrderCard.tsx');
const v2 = parse('../client/src/components/FunderOrderCardV2.tsx');
const standard = fn(card, 'FunderOrderCard');
const silver = fn(v2, 'FunderOrderCardV2Silver');
const lender = fn(v2, 'FunderLenderCardSilver');
const strictNumberHelper = fn(card, 'readConfirmedExposureGap').getText();
const frozenHelper = fn(v2, 'getFunderFrozenExternalTag').getText();
function run(expression: string, bindings: Record<string, unknown> = {}) {
  const forbidden = () => { throw Error('Network/DB forbidden in focused field tests'); };
  const context = createContext({ readLedgerTagHoldingValue, finitePositive, getUsdtCnyRateFromPrices,
    useMemo: (factory: () => unknown) => factory(), fetch: forbidden, trpc: new Proxy({}, { get: forbidden }), ...bindings });
  const compiled = ts.transpileModule(`${strictNumberHelper}\n${frozenHelper}\n(${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Script(compiled).runInContext(context, { timeout: 1000 });
}
const validValues = [0, '0', -25, '-25.5', 1200, ' 1200.5 '];
const invalidValues = [null, undefined, '', ' ', '\t', NaN, Infinity, -Infinity, 'NaN', 'Infinity', 'broken', false, true, [], [0], {}];

describe('ledger tag holding value compatibility', () => {
  it.each(validValues)('prefers finite actual CNY value %s, including zero/negative', value => {
    expect(readLedgerTagHoldingValue({ currentHoldingValue: { value }, latestBalance: { balance: 9999 } })).toBe(Number(value));
  });
  it('stock R1 needs no manual_balance row', () => {
    expect(readLedgerTagHoldingValue({ currentHoldingValue: { value: 1200, currency: 'CNY', accountingMode: 'stock_portfolio' }, latestBalance: null })).toBe(1200);
  });
  it.each(validValues)('accepts historical snapshot/manual balance %s only when new field is absent', balance => {
    expect(readLedgerTagHoldingValue({ latestBalance: { balance } })).toBe(Number(balance));
  });
  it.each(invalidValues)('invalid explicit current value %s stays unknown even with an old balance', value => {
    expect(readLedgerTagHoldingValue({ currentHoldingValue: { value }, latestBalance: { balance: 9999 } })).toBeNull();
  });
  it.each(invalidValues)('invalid historical balance %s never becomes zero', balance => {
    expect(readLedgerTagHoldingValue({ latestBalance: { balance } })).toBeNull();
  });
  it.each([null, undefined, {}, { latestBalance: null }, { latestBalance: {} },
    { currentHoldingValue: null, latestBalance: { balance: 9999 } },
    { currentHoldingValue: {}, latestBalance: { balance: 9999 } },
    { totalCny: 9999, marginByCoin: { CNY: 9999 }, initial_amount: 9999, netPnl: 9999 }])('missing %j remains unloaded with no invented total', summary => {
    expect(readLedgerTagHoldingValue(summary)).toBeNull();
  });
});

function standardExternal(summary: unknown, mode = 'raw_net_pnl') {
  return run(destructuredExpr(standard, 'extValuationCnyRate:'), {
    effectivePnlTagSummary: summary, effectivePnlTagConfig: { initial_amount: 1000, account_multiplier: 3 },
    linkedPnlTagName: 'R1', linkedCollateralTagName: '保证金', floatingPnlCalculationMode: mode,
    effectiveCollateralValuation: { totalCny: 70, usdtCnyRate: 7 }, isPricingFrozen: true, cnyRate: 7,
    _extCryptoPricesRaw: undefined, effectiveCollateralTagConfig: {}, linkedCollateralMarginRecords: [],
    linkedCollateralStockQuotes: {}, hasExternalCollateral: true, effectiveCollateralTagSummary: undefined,
  });
}
function silverExternal(summary: unknown, mode = 'raw_net_pnl', totalCny: unknown = 70, rate: unknown = 7) {
  return run(destructuredExpr(silver, 'fc2977RemainingMarginU,'), {
    isFC2977: true, _fc2977TagConfig: { initial_amount: 1000, account_multiplier: 3, margin_base: 1000 },
    _fc2977TagSummary: summary, _fc2977CollateralValuation: { totalCny, usdtCnyRate: rate },
    displayInputs: { frozen: true }, cnyRate: rate, _fc2977CryptoPricesRaw: undefined,
    externalFloatingPnlCalculationMode: mode,
  });
}
function lenderExternal(summary: unknown, mode = 'raw_net_pnl', totalCny: unknown = 70, rate: unknown = 7) {
  return run(destructuredExpr(lender, 'lnExtRemainingMarginU,'), {
    hasExternalCollateral: true, _lnExtTagConfig: { initial_amount: 1000, account_multiplier: 3, margin_base: 1000 },
    _lnExtTagSummary: summary, _lnExtCollateralValuation: { totalCny, usdtCnyRate: rate },
    displayInputs: { frozen: true }, cnyRate: rate, _lnExtPricesRaw: undefined,
    lnExternalFloatingPnlCalculationMode: mode,
  });
}
function margin(summary: unknown, old: boolean, totalCny: unknown = 70, marginBase = 1000) {
  const config = { initial_amount: 1000, account_multiplier: 3, margin_base: marginBase };
  const result = run(expr(old ? standard : silver, old ? 'referencedMarginRate' : 'referencedMarginRatePct'), old
    ? { hasExternalMarginRateReference: true, effectiveMarginRateTagSummary: summary, effectiveMarginRateTagConfig: config, effectiveMarginRateValuation: { totalCny } }
    : { hasExternalMarginRateReference: true, _marginRateTagSummary: summary, _marginRateTagConfig: config, _canonicalMarginRateValuation: { totalCny } });
  return old ? result.percent : result;
}

describe('actual standard/V2/lender production readers', () => {
  it.each([
    { currentHoldingValue: { value: 1200 }, latestBalance: null },
    { currentHoldingValue: { value: 1200 }, latestBalance: { balance: 9999 } },
    { latestBalance: { balance: 1200 } },
  ])('uses current stock value or legacy-only snapshot %j in every affected path', summary => {
    const original = JSON.stringify(summary);
    const standardValue = standardExternal(summary);
    expect(standardValue.extHoldingValueCny).toBe(1200);
    expect(standardValue.extHoldingValueU).toBeCloseTo(1200 / 7);
    expect(standardValue.extFloatingPnlU).toBeCloseTo(200 / 7);
    expect(silverExternal(summary).fc2977FloatingPnlU).toBeCloseTo(200 / 7);
    expect(silverExternal(summary).fc2977RemainingMarginU).toBeCloseTo(270 / 7);
    expect(lenderExternal(summary).lnExtFloatingPnlU).toBeCloseTo(200 / 7);
    expect(lenderExternal(summary).lnExtRemainingMarginU).toBeCloseTo(270 / 7);
    for (const old of [true, false]) expect(margin(summary, old)).toBe(67);
    expect(run(expr(standard, 'externalStockFloatPnlCny'), { isExternalStockPnlSource: true,
      effectivePnlTagSummary: summary, effectivePnlTagConfig: { initial_amount: 1000, account_multiplier: 3 },
      floatingPnlCalculationMode: 'raw_net_pnl' })).toBe(200);
    expect(JSON.stringify(summary)).toBe(original);
  });
  it('does not change raw/leveraged formulas or multiply the actual holding value', () => {
    const summary = { currentHoldingValue: { value: 1200 } };
    const leveraged = standardExternal(summary, 'leveraged_net_pnl');
    expect(leveraged.extHoldingValueCny).toBe(1200);
    expect(leveraged.extFloatingPnlU).toBeCloseTo(600 / 7);
    expect(silverExternal(summary, 'leveraged_net_pnl').fc2977RemainingMarginU).toBeCloseTo(670 / 7);
    expect(lenderExternal(summary, 'leveraged_net_pnl').lnExtRemainingMarginU).toBeCloseTo(670 / 7);
    expect(run(expr(standard, 'externalStockFloatPnlCny'), { isExternalStockPnlSource: true,
      effectivePnlTagSummary: summary, effectivePnlTagConfig: { initial_amount: 1000, account_multiplier: 3 },
      floatingPnlCalculationMode: 'leveraged_net_pnl' })).toBe(600);
  });
  it.each([0, -25])('zero/negative current value %s is confirmed across all card readers', value => {
    const summary = { currentHoldingValue: { value }, latestBalance: { balance: 9999 } };
    expect(standardExternal(summary).extHoldingValueCny).toBe(value);
    expect(standardExternal(summary).extFloatingPnlU).toBeCloseTo((value - 1000) / 7);
    expect(silverExternal(summary).fc2977FloatingPnlU).toBeCloseTo((value - 1000) / 7);
    expect(lenderExternal(summary).lnExtFloatingPnlU).toBeCloseTo((value - 1000) / 7);
    for (const old of [true, false]) {
      expect(margin(summary, old)).toBeCloseTo(((value - 1000) * 3 + 70) / 1000 * 100);
      // 未设置保证金基数时，保留现有仅正余额可作为分母的公式边界。
      expect(margin(summary, old, 70, 0)).toBeNull();
    }
  });
  it.each([null, {}, { latestBalance: { balance: '' } }, { currentHoldingValue: null, latestBalance: { balance: 9999 } },
    { currentHoldingValue: { value: ' ' }, latestBalance: { balance: 9999 } },
    { currentHoldingValue: {}, latestBalance: { balance: 9999 } }])('unavailable %j does not borrow collateral total or old balance', summary => {
    expect(standardExternal(summary).extHoldingValueCny).toBeNull();
    expect(standardExternal(summary).extFloatingPnlU).toBeNull();
    const silverValue = silverExternal(summary);
    expect(silverValue.fc2977FloatingPnlU).toBeNull(); expect(silverValue.fc2977RemainingMarginU).toBeNull();
    expect(silverValue.fc2977CollateralValueU).toBe(10);
    const lenderValue = lenderExternal(summary);
    expect(lenderValue.lnExtFloatingPnlU).toBeNull(); expect(lenderValue.lnExtRemainingMarginU).toBeNull();
    expect(lenderValue.lnExtCollateralValueU).toBe(10);
    for (const old of [true, false]) expect(margin(summary, old)).toBeNull();
    expect(run(expr(standard, 'externalStockFloatPnlCny'), { isExternalStockPnlSource: true,
      effectivePnlTagSummary: summary, effectivePnlTagConfig: {}, floatingPnlCalculationMode: 'raw_net_pnl' })).toBeNull();
  });
  it('missing collateral valuation and FX remain independent real dependencies', () => {
    const summary = { currentHoldingValue: { value: 1200 } };
    expect(silverExternal(summary, 'raw_net_pnl', null).fc2977RemainingMarginU).toBeNull();
    expect(lenderExternal(summary, 'raw_net_pnl', null).lnExtRemainingMarginU).toBeNull();
    expect(silverExternal(summary, 'raw_net_pnl', 70, null).fc2977FloatingPnlU).toBeNull();
    expect(lenderExternal(summary, 'raw_net_pnl', 70, null).lnExtFloatingPnlU).toBeNull();
    for (const old of [true, false]) expect(margin(summary, old, null)).toBeNull();
  });
});

describe('existing snapshot selectors keep live summaries out of frozen cards', () => {
  it.each([undefined, { latestBalance: { balance: 1200 } }, { currentHoldingValue: { value: 0 } }])('frozen history %j never falls back to live value', historicalSummary => {
    const frozenTag = { summary: historicalSummary };
    const liveSummary = { currentHoldingValue: { value: 9999 } };
    const selectedStandard = run(expr(standard, 'effectivePnlTagSummary'), { isPricingFrozen: true,
      frozenExternal37Tag: () => frozenTag, linkedPnlTagName: 'R1', _pnlTagSummary: liveSummary });
    expect(readLedgerTagHoldingValue(selectedStandard)).toBe(readLedgerTagHoldingValue(historicalSummary));
    for (const [root, variable, liveVariable, tagVariable] of [
      [silver, '_fc2977TagSummary', '_fc2977TagSummaryLive', 'externalCollateralTagName'],
      [silver, '_marginRateTagSummary', '_marginRateTagSummaryLive', 'marginRateReferenceTagName'],
      [lender, '_lnExtTagSummary', '_lnExtTagSummaryLive', 'lnExternalCollateralTagName'],
    ] as const) {
      const selected = run(expr(root, variable), { displayInputs: { frozen: true, snapshot: { external37: { tags: { R1: frozenTag } } } },
        [liveVariable]: liveSummary, [tagVariable]: 'R1' });
      expect(readLedgerTagHoldingValue(selected)).toBe(readLedgerTagHoldingValue(historicalSummary));
    }
  });
});
