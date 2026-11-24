import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Offline production-source/AST only. Never import/bootstrap a page, business server,
// database, application, network client, or mutation implementation.
const names = ['FunderOrderCard', 'FunderOrderCardV2', 'RightMarginDetail', 'RightInterestDetail'] as const;
type Name = typeof names[number];
const files = Object.fromEntries(names.map(name => [name, ts.createSourceFile(`${name}.tsx`,
  readFileSync(new URL(`../client/src/components/${name}.tsx`, import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)])) as Record<Name, ts.SourceFile>;
function nodes<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (guard(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root); return found;
}
function initial(file: Name, name: string, index = 0): ts.Expression {
  const declaration = nodes(files[file], ts.isVariableDeclaration)
    .filter(node => ts.isIdentifier(node.name) && node.name.text === name)[index];
  if (!declaration?.initializer) throw new Error(`Missing production declaration ${file}.${name}[${index}]`);
  return declaration.initializer;
}
function evaluate<T = any>(node: ts.Node, bindings: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(`(${node.getText()});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(code, bindings, { timeout: 1000 }) as T;
}
const tagQueries = (name: Name) => nodes(files[name], ts.isCallExpression).filter(node =>
  /\.(getTagConfig|getTagSummary|getTagMarginValuation|getTagInterestPeriods)\.useQuery$/.test(node.expression.getText()));
const reference = { orderId: 123, userId: 72 };
const context = {
  order: { id: 123, user_id: 28, ledger_id: 52 }, ledgerId: 52, sourceIsLedger37: true,
  _parsedCollateralSource: { ledgerId: 37 }, _lnParsedCollateralSource: { ledgerId: 37 },
  reference52UserId: 72, _jointSegmentScopeUserId: 28, _v2ParticipantId: 72, _v2OwnerId: 28,
  _lnParticipantId: 72, _lnOwnerId: 28,
};
const labels = {
  linkedPnlTagName: '盈亏', linkedCollateralTagName: '担保', linkedMarginRateTagName: '比例',
  linkedPendingInterestTagName: '待结', linkedPaidInterestTagName: '已结',
  externalCollateralTagName: '担保', marginRateReferenceTagName: '比例', lnExternalCollateralTagName: '借出担保',
};
const state = {
  isSettlementFinal: false, sourceIsLedger37: true, linkedPnlTagName: '盈亏', hasExternalCollateral: true,
  hasExternalMarginRateReference: true, hasExternalPendingInterest: true, hasExternalPaidInterest: true,
  displayInputs: { frozen: false }, pnlConfigError: null, pnlSummaryError: null,
  collateralConfigError: null, collateralSummaryError: null, collateralValuationError: null,
  marginRateConfigError: null, marginRateSummaryError: null, marginRateValuationError: null,
  pendingInterestPeriodsError: null, pendingInterestConfigError: null, paidInterestPeriodsError: null,
};

describe('52 order-bound ledger37 frontend reference', () => {
  it.each(['FunderOrderCard', 'FunderOrderCardV2'] as const)('%s emits only a saved 52/37 order and concrete personal user scope', file => {
    const count = file === 'FunderOrderCard' ? 1 : 2;
    for (let index = 0; index < count; index++) {
      const expression = initial(file, 'reference52', index);
      expect(evaluate(expression, context)).toEqual(reference);
      for (const id of [undefined, 0, -1, 1.5, 'preview'])
        expect(evaluate(expression, { ...context, order: { ...context.order, id } })).toBeUndefined();
      for (const ledgerId of [37, 51]) expect(evaluate(expression, { ...context, ledgerId })).toBeUndefined();
      expect(evaluate(expression, { ...context, sourceIsLedger37: false,
        _parsedCollateralSource: { ledgerId: 38 }, _lnParsedCollateralSource: { ledgerId: 38 } })).toBeUndefined();
      expect(evaluate(expression, { ...context, reference52UserId: 0 })).toBeUndefined();
      expect(evaluate(expression, { ...context, reference52UserId: 88 })).toEqual({ orderId: 123, userId: 88 });
    }
  });

  it('original personal scope prioritizes joint snapshot/current collaborator, never the 37 owner', () => {
    const personal = initial('FunderOrderCard', '_jointSegmentScopeUserId');
    expect(evaluate(personal, { _jointSnapshotUserId: 91, _collaboratorUserId: 72, _parentOwnerUserId: 28 })).toBe(91);
    expect(evaluate(personal, { _jointSnapshotUserId: 0, _collaboratorUserId: 72, _parentOwnerUserId: 28 })).toBe(72);
    expect(evaluate(personal, { _jointSnapshotUserId: 0, _collaboratorUserId: 0, _parentOwnerUserId: 28 })).toBe(28);
    expect(evaluate(initial('FunderOrderCard', 'reference52UserId'), { ...context,
      order: { ...context.order, joint_segment_owner_user_id: 91 } })).toBe(91);
  });

  it('V2 both borrow and lend scopes retain participant/joint metadata over the physical owner', () => {
    for (const index of [0, 1]) {
      const scope = initial('FunderOrderCardV2', 'reference52UserId', index);
      expect(evaluate(scope, context)).toBe(72);
      expect(evaluate(scope, { ...context, order: { ...context.order, _jointSnapshotUserId: 91 } })).toBe(91);
      expect(evaluate(scope, { ...context, order: { ...context.order, joint_segment_owner_user_id: 99 } })).toBe(99);
    }
    const ln = initial('FunderOrderCardV2', '_lnParsedCollateralSource').getText();
    expect(ln).toContain('(order as any).collateral_source');
    expect(ln).not.toContain('loan_source');
  });

  it.each(['FunderOrderCard', 'FunderOrderCardV2'] as const)('%s isolates every tag query input by order and personal view; frozen queries stay disabled', file => {
    const queries = tagQueries(file);
    expect(queries).toHaveLength(file === 'FunderOrderCard' ? 11 : 9);
    for (const query of queries) {
      expect(query.arguments[0].getText()).toContain('...reference52Input');
      const input = evaluate(query.arguments[0], { ...context, ...labels, reference52Input: { reference52: reference } });
      expect(input.reference52).toEqual(reference);
      expect(input.ledgerId).toBe(37);
      const other = evaluate(query.arguments[0], { ...context, ...labels,
        reference52Input: { reference52: { orderId: 124, userId: 88 } } });
      expect(JSON.stringify(other)).not.toBe(JSON.stringify(input));
      const legacy = evaluate(query.arguments[0], { ...context, ...labels, reference52Input: {} });
      expect(Object.hasOwn(legacy, 'reference52')).toBe(false);
      const options = evaluate(query.arguments[1], { shouldLoadRemoteDetails: false, ...labels,
        hasExternalCollateral: true, hasExternalMarginRateReference: true,
        hasExternalPendingInterest: true, hasExternalPaidInterest: true, displayInputs: { frozen: true } });
      expect(options.enabled).toBe(false);
      expect(query.parent.getText()).toMatch(/error:/);
    }
  });

  it.each(['RightMarginDetail', 'RightInterestDetail'] as const)('%s optional prop retains byte-equivalent old input values and all tag queries use it', file => {
    const tagInput = initial(file, 'tagInput');
    const legacy = evaluate(tagInput, { ledgerId: 37, tagName: '原标签', reference52: undefined });
    expect(legacy).toEqual({ ledgerId: 37, tagName: '原标签' });
    expect(Object.hasOwn(legacy, 'reference52')).toBe(false);
    const scoped = evaluate(tagInput, { ledgerId: 37, tagName: '原标签', reference52: reference });
    expect(scoped).toEqual({ ledgerId: 37, tagName: '原标签', reference52: reference });
    for (const query of tagQueries(file)) expect(query.arguments[0].getText()).toBe('tagInput');
    expect(files[file].text).toContain('reference52?: Ledger37OrderReferenceScope');
    expect(files[file].text).not.toMatch(/\{(?:periods|config|summary|valuation)Error\.message\}/);
  });

  it('all original and V2 detail entry points receive the same reference52; V2 frozen details are gated', () => {
    for (const file of ['FunderOrderCard', 'FunderOrderCardV2'] as const) {
      const details = nodes(files[file], ts.isJsxSelfClosingElement)
        .filter(node => /^Right(Margin|Interest)Detail$/.test(node.tagName.getText()));
      expect(details).toHaveLength(file === 'FunderOrderCard' ? 2 : 3);
      for (const detail of details) {
        const attribute = detail.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.getText() === 'reference52');
        expect(attribute?.getText()).toBe('reference52={reference52}');
        if (file === 'FunderOrderCardV2') {
          let ancestor: ts.Node | undefined = detail.parent;
          while (ancestor && !ts.isConditionalExpression(ancestor)) ancestor = ancestor.parent;
          expect((ancestor as ts.ConditionalExpression)?.condition.getText()).toBe('displayInputs.frozen');
        }
      }
    }
  });

  it('52 margin detail never broadens reference permission to category lists or transaction histories', () => {
    const queries = nodes(files.RightMarginDetail, ts.isCallExpression).filter(node =>
      /\.(getCategories|getTransactions)\.useQuery$/.test(node.expression.getText()));
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      const options = evaluate(query.arguments[1], { ledgerId: 37, selectedTagCategoryId: 1, reference52: reference });
      expect(options.enabled).toBe(false);
      const legacy = evaluate(query.arguments[1], { ledgerId: 37, selectedTagCategoryId: 1, reference52: undefined });
      expect(legacy.enabled).toBe(true);
    }
    expect(files.RightMarginDetail.text).toContain('{!reference52 && <>');
  });

  it('pending/failed queries are visible before empty/default[] rendering and contain no raw permission text', () => {
    for (const file of ['RightMarginDetail', 'RightInterestDetail'] as const) {
      const guards = nodes(files[file], ts.isIfStatement).filter(node => /Error|Pending/.test(node.expression.getText()));
      const error = guards.find(node => node.expression.getText().includes('configError'));
      const pending = guards.find(node => node.expression.getText().includes('configPending'));
      expect(error).toBeDefined(); expect(pending).toBeDefined();
      expect(error!.thenStatement.getText()).toContain('role="alert"');
      expect(error!.thenStatement.getText()).toContain('数据读取失败');
      expect(pending!.thenStatement.getText()).toContain('读取中...');
      expect(error!.pos).toBeLessThan(pending!.pos);
      if (file === 'RightInterestDetail') {
        const empty = nodes(files[file], ts.isIfStatement).find(node => node.expression.getText() === 'periodDetails.length === 0');
        expect(pending!.pos).toBeLessThan(empty!.pos);
      }
    }
  });

  it('card errors are enabled only for relevant live references, not settled cached errors', () => {
    for (const [name, field] of [
      ['externalPnlReadError', 'pnlConfigError'], ['externalCollateralReadError', 'collateralValuationError'],
      ['externalMarginRateReadError', 'marginRateSummaryError'], ['externalPendingInterestReadError', 'pendingInterestConfigError'],
      ['externalPaidInterestReadError', 'paidInterestPeriodsError'],
    ]) {
      const expression = initial('FunderOrderCard', name);
      expect(evaluate(expression, state)).toBe(false);
      expect(evaluate(expression, { ...state, [field]: { message: 'private permission detail' } })).toBe(true);
      expect(evaluate(expression, { ...state, [field]: {}, isSettlementFinal: true })).toBe(false);
    }
    for (const index of [0, 1]) {
      const expression = initial('FunderOrderCardV2', 'externalCollateralReadError', index);
      expect(evaluate(expression, { ...state, collateralConfigError: {} })).toBe(true);
      expect(evaluate(expression, { ...state, collateralConfigError: {}, displayInputs: { frozen: true } })).toBe(false);
    }
  });

  it('actual referenced interest calculations preserve genuine zero and undefined remains unknown', () => {
    const base = { useMemo: (fn: () => unknown) => fn(), hasExternalPendingInterest: true, hasExternalPaidInterest: true,
      effectivePendingInterestPeriods: [], effectivePaidInterestPeriods: [], effectivePendingInterestTagConfig: {},
      linkedPendingInterestTagName: '待结', linkedPaidInterestTagName: '已结', isPricingFrozen: false, settlementSnapshot: null };
    expect(evaluate(initial('FunderOrderCard', 'linked37PendingInterestCny'), base)).toBe(0);
    expect(evaluate(initial('FunderOrderCard', 'linked37PaidInterestCny'), base)).toBe(0);
    expect(evaluate(initial('FunderOrderCard', 'linked37PendingInterestCny'), { ...base, effectivePendingInterestPeriods: undefined })).toBeNull();
    expect(evaluate(initial('FunderOrderCard', 'linked37PaidInterestCny'), { ...base, effectivePaidInterestPeriods: undefined })).toBeNull();
  });

  it('all financial mutations remain byte-for-byte unchanged from the approved clean baseline', () => {
    const baseline = {
      FunderOrderCard: { count: 25, hash: 'fbe99a80b6c9b366b0fb843638f771568fbbf2ced03134086a47669f1712099e' },
      FunderOrderCardV2: { count: 4, hash: '74a063fedb315ad81352c86a54351d685742aae8c2423483a7c00d046dd0641d' },
    };
    for (const name of ['FunderOrderCard', 'FunderOrderCardV2'] as const) {
      const mutations = nodes(files[name], ts.isCallExpression).filter(node => ts.isPropertyAccessExpression(node.expression)
        && ['useMutation', 'mutate', 'mutateAsync'].includes(node.expression.name.text)).map(node => node.getText());
      expect(mutations).toHaveLength(baseline[name].count);
      expect(createHash('sha256').update(mutations.join('\n')).digest('hex')).toBe(baseline[name].hash);
    }
  });
});
