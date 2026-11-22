import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as display from '../shared/funder-settled-display';
import * as fx from '../shared/usdt-cny-display';
import * as input from '../shared/funder-settlement-input';

const parse = (name: string) => ts.createSourceFile(name, readFileSync(new URL(`../client/src/components/${name}.tsx`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const card = parse('FunderOrderCard'); const v2 = parse('FunderOrderCardV2');
function nodes<T extends ts.Node>(root: ts.Node, guard: (n: ts.Node) => n is T): T[] {
  const result: T[] = []; const visit = (n: ts.Node) => { if (guard(n)) result.push(n); ts.forEachChild(n, visit); }; visit(root); return result;
}
function required<T>(value: T | undefined, label: string): T { if (value === undefined) throw Error(`Missing production AST: ${label}`); return value; }
const fn = (root: ts.Node, name: string) => required(nodes(root, ts.isFunctionDeclaration).find(n => n.name?.text === name), name);
const old = fn(card, 'FunderOrderCard'); const silver = fn(v2, 'FunderOrderCardV2Silver'); const lender = fn(v2, 'FunderLenderCardSilver');
const expr = (root: ts.Node, name: string) => required(nodes(root, ts.isVariableDeclaration).find(n => n.name.getText() === name)?.initializer, name).getText();
const declarations = (root: ts.Node, names: string[]) => names.map(name => `const ${name} = ${expr(root, name)};`).join('\n');
const createElement = (tag: any, props: any, ...children: any[]) => ({ tag, props: props ?? {}, children });
function text(tree: any): string { if (Array.isArray(tree)) return tree.map(text).join(''); if (tree?.children) return text(tree.children); return tree == null || typeof tree === 'boolean' ? '' : String(tree); }
function run(expression: string, bindings: Record<string, any> = {}, code = ''): any {
  const forbidden = () => { throw Error('Network/DB forbidden'); };
  const context = createContext({ ...fx, ...display, ...input, React: { createElement, Fragment: 'fragment' }, useMemo: (f: () => any) => f(), fetch: forbidden, trpc: new Proxy({}, { get: forbidden }), ...bindings });
  const compiled = ts.transpileModule(`${code}\n(${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Script(compiled).runInContext(context, { timeout: 1000 });
}
function jsx(root: ts.Node, tag: string, content: string) {
  return required(nodes(root, ts.isJsxElement).find(n => n.openingElement.tagName.getText() === tag && n.getText().includes(content)), content);
}
const snapshot = { version: 2, usdtCnyRate: 7, priceBySymbol: { ETH: 2000 }, optionQuote: { markPriceUsdt: 0, delta: 0, gamma: null, theta: 0, vega: 0, iv: 0 } };

describe('normal-list historical display executes production TSX offline', () => {
  it.each([card, v2])('card TSX parses', ast => expect((ast as any).parseDiagnostics).toEqual([]));
  it.each([null, { version: 1, usdtCnyRate: 7 }, snapshot, JSON.stringify(snapshot)])('main card and V2 preserve the same history for %s', settlement_snapshot => {
    const order = { status: 'settled', coin: 'ETH', settlement_snapshot };
    const selected = run(expr(old, 'historicalDisplay'), { order, jointSegmentMode: false });
    const helpers = fn(v2, 'getFunderCardDisplayInputs').getText();
    const values = run('getFunderCardDisplayInputs(order, { ETH: 9999 }, 99)', { order }, helpers);
    expect(values.snapshot).toEqual(selected.snapshot);
    expect(values.cnyRate).toEqual(settlement_snapshot ? 7 : NaN);
    expect(values.livePrices.ETH).toEqual(settlement_snapshot && display.parseFunderHistoricalRecord(settlement_snapshot)?.priceBySymbol ? 2000 : undefined);
  });
  it('primary JSON wrapper and explicit primary null cannot borrow physical quote', () => {
    const order = { status: 'settled', coin: 'ETH', settlement_snapshot: snapshot, joint_order_primary_settlement: JSON.stringify({ status: 'settled', settlement_snapshot: null }) };
    const values = run('getFunderCardDisplayInputs(order, { ETH: 9999 }, 99)', { order }, fn(v2, 'getFunderCardDisplayInputs').getText());
    expect(values.snapshot).toBeNull(); expect(values.cnyRate).toBeNaN(); expect(values.livePrices.ETH).toBeUndefined();
    expect(run(expr(old, 'historicalDisplay'), { order, jointSegmentMode: false }).snapshot).toBeNull();
    expect(run(expr(old, 'historicalDisplay'), { order, jointSegmentMode: true }).snapshot.optionQuote.markPriceUsdt).toBe(0);
  });
  it('v1 FX without mark renders specifically missing contract price, not missing whole snapshot', () => {
    const value = jsx(old, 'span', "isOptionSettlementQuoteMissing ? '未保存结算合约价'");
    expect(text(run(value.getText(), { greeksResult: { loading: false }, optionMarkPrice: null, isOptionSettlementQuoteMissing: true,
      optionMarkPriceTone: '#999', optionMarkPriceDirection: 'same' }))).toBe('未保存结算合约价');
  });
  it('saved mark 0 and Greek 0 remain valid while mark-only/NaN Greeks collapse', () => {
    for (const optionQuote of [snapshot.optionQuote, { markPriceUsdt: 10 }, { markPriceUsdt: null, delta: NaN }]) {
      const data = run(expr(old, 'optionGreeksData'), { isPricingFrozen: true, settlementSnapshot: { optionQuote }, greeksResult: { data: { markPrice: 999, delta: 1 } } });
      expect(run(expr(old, 'historicalGreeksMissing'), { isSettlementFinal: true, optionGreeksData: data })).toBe(!display.hasValidFunderHistoricalGreeks(data));
    }
    const details = jsx(old, 'details', '历史 Greeks 未保存');
    const tree = run(details.getText()); expect(tree.tag).toBe('details'); expect(tree.props.open).toBeUndefined(); expect(text(tree)).toContain('历史 Greeks 未保存');
    expect(jsx(silver, 'details', '历史 Greeks 未保存').openingElement.attributes.properties.some(p => p.getText() === 'open')).toBe(false);
    expect(run(expr(silver, 'optionDisplayQuote'), { displayInputs: { frozen: true, snapshot }, greeksResult: { data: { markPrice: 999 } } }).markPrice).toBe(0);
  });
  it.each([null, undefined, { iv: 0 }])('V2 IV formatter is safe for %s and preserves valid zero', optionDisplayQuote => {
    const historicalIv = expr(silver, 'historicalIv');
    const renderedIv = required(nodes(silver, ts.isConditionalExpression).find(n => n.getText().includes('historicalIv !== null')), 'V2 IV rendered formatter').getText();
    const value = run(historicalIv, { d: optionDisplayQuote });
    expect(run(renderedIv, { historicalIv: value })).toBe(optionDisplayQuote?.iv === 0 ? '0.0%' : '--');
  });
  it('missing FX warning and formatter differ between historical and running orders', () => {
    const warning = jsx(old, 'p', '未保存结算汇率；');
    expect(text(run(warning.getText(), { isSettlementFinal: true }))).toContain('未保存结算汇率');
    expect(text(run(warning.getText(), { isSettlementFinal: true }))).not.toContain('待更新');
    expect(text(run(warning.getText(), { isSettlementFinal: false }))).toContain('待更新');
    expect(run(expr(old, 'formatFxEstimate'), { isSettlementFinal: true, settlementSnapshot: null })(NaN, 'toFixed', 2)).toBe('未保存结算汇率');
  });
  it.each([old, silver, lender])('raw registered paid value survives missing FX, separate from displayPaid/risk', root => {
    const bindings = { order: { paidTotal: { amount: '125', currency: 'CNY' } }, baseCur: 'CNY', rateCur: 'USDT', displayPaid: NaN,
      hasExternalPaidInterest: false, displayedPaidValue: NaN, displayedPaidUnit: 'u' };
    const result = run('({paidRowValue,paidRowUnit})', bindings, declarations(root, ['registeredPaidDisplay', 'paidRowValue', 'paidRowUnit']));
    expect(result).toEqual({ paidRowValue: 125, paidRowUnit: '元' });
  });
  it.each([silver, lender])('V2 unexpanded normal list visibly preserves registered paid and commission %s', root => {
    const row = required(nodes(root, ts.isJsxElement).find(n => n.openingElement.tagName.getText() === 'div'
      && n.openingElement.attributes.getText().includes('space-y-1 text-xs') && n.getText().includes('已结利息（原登记）')), 'normal list registered rows');
    const bindings = { order: { paidTotal: { amount: '125', currency: 'CNY' } }, registeredPaidDisplay: { nativeFallback: true },
      paidRowValue: 125, paidRowUnit: '元', registeredCommissionDisplay: { value: 25, currency: 'CNY' }, TXT_SEC: '#999', TXT_PRI: '#000', DIVIDER: '#eee',
      fmt: (value: number) => String(value) };
    const rendered = text(run(row.getText(), bindings));
    expect(rendered).toContain('已结利息（原登记）125 元'); expect(rendered).toContain('已登记分成25 元');
    expect(row.getText()).not.toContain('feeExpanded');
  });
  it('joint child cannot repeat its parent registered commission', () => {
    expect(run(expr(old, 'registeredCommissionDisplay'), { jointSegmentMode: true, order: { participantInfo: { paidCommission: 125, interestBaseCurrency: 'CNY' } } })).toBeNull();
  });
  it('raw principal and quantity are not fed to missing-FX formatter', () => {
    const order = { asset_type: 'stock', amount: '125', buy_quantity: '2', buy_price: '20' };
    const value = run('getExactFinancingDisplayAmount(order, "CNY", NaN)', { order }, fn(v2, 'getExactFinancingDisplayAmount').getText());
    expect(value).toBe(125);
    expect(run(expr(old, 'financingDisplayAmount'), { savedFinancingInputAmount: 125, savedFinancingInputCurrency: 'CNY', amountCurrency: 'CNY', isStockOrder: true,
      storedAmount: 125, linkedFinancingAmount: 40, legacyInterestBase: 125, legacyInterestBaseCurrency: 'CNY', calculatedFinancingDisplayAmount: NaN })).toBe(125);
  });
});

describe('internal confirmation only sends prices on explicit user confirmation', () => {
  const settleButton = jsx(old, 'button', '$updateMutation.mutate({ id: _intConfirmSettleId, ledgerId, status:');
  const action = required(settleButton.openingElement.attributes.properties.find((n): n is ts.JsxAttribute => ts.isJsxAttribute(n) && n.name.getText() === 'onClick')?.initializer, 'confirm handler');
  const actionExpr = required(ts.isJsxExpression(action) ? action.expression : undefined, 'confirm expression').getText();
  function confirm(overrides: Record<string, any> = {}) {
    const mutate = vi.fn(); const error = vi.fn(); const close = vi.fn();
    run(`(${actionExpr})()`, { $updateMutation: { mutate }, toast: { error }, closeInternalSettleConfirm: close,
      _intConfirmSettleId: 1, ledgerId: 52, order: { asset_type: 'crypto_option' }, isOptionOrder: true,
      _intSettleInterestEndDate: '', _intSettlePrice: '', _intSettleExchangeRate: '', _intSettleOptionMarkPrice: '',
      historicalDate: false, getBeijingToday: () => '2026-11-22', ...overrides });
    return { mutate, error, close };
  }
  it.each(['0', '25.50'])('manual contract mark %s is passed without falsy-number loss', value => {
    const result = confirm({ _intSettleOptionMarkPrice: value });
    expect(result.mutate).toHaveBeenCalledWith(expect.objectContaining({ status: 'settled', settlementOptionMarkPrice: value }));
    expect(result.close).toHaveBeenCalledOnce(); expect(result.error).not.toHaveBeenCalled();
  });
  it('today blank stays undefined (server quote), never zero', () => {
    const result = confirm(); expect(result.mutate.mock.calls[0][0].settlementOptionMarkPrice).toBeUndefined();
  });
  it.each([' ', 'NaN', '-1', 'Infinity'])('invalid historical contract value %s blocks submission', value => {
    const result = confirm({ historicalDate: true, _intSettleInterestEndDate: '2026-11-20', _intSettlePrice: '2000', _intSettleExchangeRate: '7', _intSettleOptionMarkPrice: value });
    expect(result.mutate).not.toHaveBeenCalled(); expect(result.close).not.toHaveBeenCalled(); expect(result.error).toHaveBeenCalledOnce();
  });
  it('historical date sends primary price, FX and real zero mark', () => {
    const result = confirm({ historicalDate: true, _intSettleInterestEndDate: '2026-11-20', _intSettlePrice: '2000', _intSettleExchangeRate: '7', _intSettleOptionMarkPrice: '0' });
    expect(result.mutate).toHaveBeenCalledWith(expect.objectContaining({ interestEndDate: '2026-11-20', settlementPrice: '2000', settlementExchangeRate: '7', settlementOptionMarkPrice: '0' }));
  });
  it.each([{ _intSettlePrice: '' }, { _intSettleExchangeRate: '' }, { _intSettlePrice: '0' }, { _intSettleExchangeRate: '0' }, { _intSettlePrice: '2e3' }])('bad/missing historical primary/FX is blocked %s', invalid => {
    const result = confirm({ historicalDate: true, _intSettleInterestEndDate: '2026-11-20', _intSettlePrice: '2000', _intSettleExchangeRate: '7', _intSettleOptionMarkPrice: '0', ...invalid });
    expect(result.mutate).not.toHaveBeenCalled();
  });
  it('outer callback takes precedence and does not open or submit internal confirmation', () => {
    const onConfirmSettle = vi.fn(); const setInternal = vi.fn();
    run(`(${expr(old, 'requestSettleConfirmation')})()`, { onConfirmSettle, order: { id: 1 }, _intSetConfirmSettleId: setInternal });
    expect(onConfirmSettle).toHaveBeenCalledWith({ id: 1 }); expect(setInternal).not.toHaveBeenCalled();
  });
  it('date change clears previous price values; dialog is mobile-scrollable', () => {
    const dateInput = required(nodes(old, ts.isJsxSelfClosingElement).find(n => n.getText().includes('value={_intSettleInterestEndDate')), 'date input');
    const handler = required(dateInput.attributes.properties.find((n): n is ts.JsxAttribute => ts.isJsxAttribute(n) && n.name.getText() === 'onChange')?.initializer, 'date onChange');
    const change = required(ts.isJsxExpression(handler) ? handler.expression : undefined, 'date expression');
    const clear = vi.fn(); const setDate = vi.fn(); run(`(${change.getText()})({target:{value:"2026-11-20"}})`, { _intSetSettleInterestEndDate: setDate, clearInternalSettlePrices: clear });
    expect(clear).toHaveBeenCalledOnce(); expect(setDate).toHaveBeenCalledWith('2026-11-20');
    expect(old.getText()).toContain('max-h-[85vh] overflow-y-auto');
  });
});
