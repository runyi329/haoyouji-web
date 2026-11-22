import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { getFunderSettlementDraftError, readFunderSettlementOptionMarkInput } from '../shared/funder-settlement-input';

const today = '2026-11-22';
const historical = { interestEndDate: '2026-11-21', settlementPrice: '2000', settlementExchangeRate: '6.7' };

describe('confirmed option settlement input', () => {
  it.each(['0', '0.00', '1', '12.5', ' 0 '])('keeps explicit valid decimal %s', value => {
    expect(readFunderSettlementOptionMarkInput(value)).toBe(value.trim());
  });
  it.each([null, undefined, '', ' ', false, true, 0, -1, '-1', 'NaN', 'Infinity', '1e3', '.5', '1.', '1.2.3'])('does not convert %s into a confirmed zero', value => {
    expect(readFunderSettlementOptionMarkInput(value)).toBeNull();
  });
  it('rejects numeric overflow even if the input matches a decimal pattern', () => {
    expect(readFunderSettlementOptionMarkInput('9'.repeat(400))).toBeNull();
  });
});

describe('settlement draft requirements', () => {
  it('today may leave the option input empty for a server-confirmed quote', () => {
    expect(getFunderSettlementDraftError({ interestEndDate: today, settlementOptionMarkPrice: '' }, today, 'crypto_option')).toBeNull();
  });
  it.each(['0', '12.5'])('today may supply actual confirmed price %s', settlementOptionMarkPrice => {
    expect(getFunderSettlementDraftError({ interestEndDate: today, settlementOptionMarkPrice }, today, 'crypto_option')).toBeNull();
  });
  it.each(['-1', 'Infinity', '1e3'])('today rejects an invalid explicit option price %s', settlementOptionMarkPrice => {
    expect(getFunderSettlementDraftError({ interestEndDate: today, settlementOptionMarkPrice }, today, 'crypto_option')).toContain('有效');
  });
  it('a past option settlement requires historical evidence, including a valid zero if worthless', () => {
    expect(getFunderSettlementDraftError({ ...historical, settlementOptionMarkPrice: '' }, today, 'crypto_option')).toContain('真实合约');
    expect(getFunderSettlementDraftError({ ...historical, settlementOptionMarkPrice: '0' }, today, 'crypto_option')).toBeNull();
  });
  it.each([
    { settlementPrice: '', settlementExchangeRate: '6.7' },
    { settlementPrice: '2000', settlementExchangeRate: '' },
    { settlementPrice: '0', settlementExchangeRate: '6.7' },
    { settlementPrice: '2000', settlementExchangeRate: '0' },
  ])('historical underlying and FX remain mandatory: %j', overrides => {
    expect(getFunderSettlementDraftError({ ...historical, ...overrides, settlementOptionMarkPrice: '0' }, today, 'crypto_option')).toContain('标的价');
  });
  it('stock or crypto segments do not inherit an option requirement from another segment', () => {
    expect(getFunderSettlementDraftError(historical, today, 'crypto')).toBeNull();
    expect(getFunderSettlementDraftError(historical, today, 'stock')).toBeNull();
    expect(getFunderSettlementDraftError(historical, today, 'crypto_option')).not.toBeNull();
  });
});

const source = readFileSync(new URL('../client/src/pages/FunderManagement.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('FunderManagement.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const result: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
  visit(root); return result;
}

describe('actual management settlement form source', () => {
  it('single and joint option inputs are outside the historical-only branch', () => {
    const inputs = find(ast, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'input'
      && /value=\{(?:draft|settleValuation)\.settlementOptionMarkPrice\}/.test(node.getText()));
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input.getText()).toContain('min="0"');
      let ancestor = input.parent;
      while (ancestor) {
        if (ts.isConditionalExpression(ancestor)) {
          expect(ancestor.condition.getText()).not.toMatch(/isHistorical|interestEndDate.*getBeijingToday/);
        }
        ancestor = ancestor.parent;
      }
    }
  });
  it('both paths validate actual optional input and preserve an explicit zero in payload', () => {
    expect(source).toContain('getFunderSettlementDraftError(segment, getBeijingToday(), segment.assetType)');
    expect(source).toContain('getFunderSettlementDraftError({ ...settleValuation, interestEndDate }, getBeijingToday(), targetOrder?.asset_type)');
    expect(source).toContain('readFunderSettlementOptionMarkInput(segment.settlementOptionMarkPrice) !== null');
    expect(source).toContain('readFunderSettlementOptionMarkInput(settleValuation.settlementOptionMarkPrice) !== null');
  });
  it('joint segments use their own asset type, not a main-order-wide option classification', () => {
    expect(source).toContain('entry.segment?.asset_type || targetOrder?.asset_type');
    expect(source).toContain('assetType: entry.segment?.asset_type || targetOrder?.asset_type');
  });
  it.each([
    ['crypto', 'crypto_option'],
    ['crypto_option', 'stock'],
    ['crypto_option', undefined],
  ])('the real entry mapper preserves segment type %s / %s for form and validation', (mainType, segmentType) => {
    const declaration = find(ast, node => ts.isVariableDeclaration(node) && node.name.getText() === 'jointSettlementEntries')[0];
    if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) {
      throw new Error('Missing production joint settlement entry mapper');
    }
    const mapper = declaration.initializer.arguments[0];
    if (!mapper || !ts.isArrowFunction(mapper)) throw new Error('Missing production joint entry map callback');
    const segment = segmentType ? { asset_type: segmentType, status: 'active' } : undefined;
    const entry = { id: segment ? 'segment-2' : 'primary', displayIndex: segment ? 1 : 0, isPrimary: !segment,
      interestStartDate: '2026-11-20', segment };
    const context = createContext({ entry, targetOrder: { asset_type: mainType, interest_start_date: '2026-11-20' },
      primaryJointSettlement: {}, fetch: () => { throw new Error('Network forbidden'); } });
    const code = ts.transpileModule(`const mapEntry = ${mapper.getText()}; mapEntry(entry);`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    const result = new Script(code).runInContext(context, { timeout: 1000 });
    expect(result.segment).toBe(segment);
    const assetType = result.segment?.asset_type || mainType;
    expect(assetType).toBe(segmentType || mainType);
    const error = getFunderSettlementDraftError({ ...historical, settlementOptionMarkPrice: '' }, today, assetType);
    expect(Boolean(error)).toBe(assetType === 'crypto_option');
    expect(getFunderSettlementDraftError({ ...historical, settlementOptionMarkPrice: '0' }, today, assetType)).toBeNull();
  });
  it('changing either settlement date clears prior manual evidence and does not prefill today FX for history', () => {
    expect(source).toContain("settlementExchangeRate: e.target.value === getBeijingToday() && finitePositive(cnyRate) !== null ? String(cnyRate) : ''");
    expect(source).toContain("settlementExchangeRate: nextDate === getBeijingToday() && finitePositive(cnyRate) !== null ? String(cnyRate) : ''");
    const cleared = source.match(/settlementOptionMarkPrice: '',/g) || [];
    expect(cleared.length).toBeGreaterThanOrEqual(2);
  });
});
