import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// 直接检查生产组件的 JSX 接线并执行其纯布尔表达式，避免导入整个应用/连接真实数据库。
const source = readFileSync(new URL('../client/src/components/FunderOrderCard.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('FunderOrderCard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNodes<T extends ts.Node>(predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}
function initializer(name: string): string {
  const node = findNodes(ts.isVariableDeclaration).find(n => n.name.getText(ast) === name);
  if (!node?.initializer) throw new Error(`Missing production initializer: ${name}`);
  return node.initializer.getText(ast);
}
function evaluate(name: string, values: Record<string, unknown>): any {
  return new Function(...Object.keys(values), `return (${initializer(name)});`)(...Object.values(values));
}
const hiddenCard = findNodes(ts.isJsxSelfClosingElement).find(node =>
  node.tagName.getText(ast) === 'FunderOrderCard'
  && node.attributes.properties.some(prop => ts.isJsxAttribute(prop)
    && prop.name.getText(ast) === 'order'
    && prop.initializer?.getText(ast) === '{sourceCandidate.sourceOrder}'),
);
function hiddenPreviewMode(): boolean {
  if (!hiddenCard) throw new Error('Missing hidden shared-pool calculation card');
  const prop = hiddenCard.attributes.properties.find(n => ts.isJsxAttribute(n) && n.name.getText(ast) === 'previewMode');
  return !!prop && ts.isJsxAttribute(prop) && prop.initializer?.getText(ast) === '{true}';
}

describe('共享弹窗原订单计算卡的行情启用边界', () => {
  it('display:none的原订单卡显式进入预览计算模式，不能等待IntersectionObserver', () => {
    expect(hiddenPreviewMode()).toBe(true);
    expect(evaluate('shouldLoadRemoteDetails', {
      isSettlementFinal: false, previewMode: hiddenPreviewMode(), jointSegmentMode: false, cardNearViewport: false,
    })).toBe(true);
  });
  it('普通离屏订单仍保留按需加载，不放开全列表轮询', () => {
    expect(evaluate('shouldLoadRemoteDetails', {
      isSettlementFinal: false, previewMode: false, jointSegmentMode: false, cardNearViewport: false,
    })).toBe(false);
  });
  it.each(['预览计算卡', '可见订单卡', '联合子段卡'])('已结清的%s仍禁止读取实时行情', mode => {
    expect(evaluate('shouldLoadRemoteDetails', {
      isSettlementFinal: true, previewMode: mode === '预览计算卡',
      jointSegmentMode: mode === '联合子段卡', cardNearViewport: mode === '可见订单卡',
    })).toBe(false);
  });
});

describe('共享总计必须等待原卡同源持仓差额', () => {
  const context = (ready: boolean, coll = 34534.93) => ({
    sharedHoldingGapReady: ready, totalColl: coll,
    // 旧服务器把48.5张期权当ETH，产生错误的125223和159758；不能作临时金额回退。
    hasClientFinalGaps: ready, hasServerSummary: true,
    serverHoldingBalance: 125223, serverTotalGap: 159758,
    sharedHoldingGapTotal: -381.22,
  });
  it('期权原卡还没回传时总计等待，不能显示服务器现货简化估值', () => {
    expect(evaluate('allHaveGap', context(false))).toBe(false);
  });
  it('全部原卡回传后，总计严格等于第三项加第四项，担保只计一次', () => {
    const values = context(true);
    expect(evaluate('allHaveGap', values)).toBe(true);
    const holdingBalance = evaluate('holdingBalance', values);
    expect(holdingBalance).toBe(-381.22);
    expect(evaluate('diff', { ...values, holdingBalance })).toBeCloseTo(34153.71, 8);
  });
  it('担保物价格缺失时仍等待，不伪装成已完成', () => {
    expect(evaluate('allHaveGap', context(true, NaN))).toBe(false);
  });
});

const holdingGapFunctions = ['readConfirmedExposureGap', 'readConfirmedHoldingGap'].map(name => {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!node) throw new Error(`Missing production function: ${name}`);
  return node.getText(ast);
});
const holdingGapCode = ts.transpileModule(holdingGapFunctions.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const readHoldingGap = new Function(`${holdingGapCode}\nreturn readConfirmedHoldingGap;`)() as
  (finalGap: unknown, collateral: unknown) => number | null;

describe('第三项必须剔除同次计算的担保物', () => {
  it('FT1366实时担保价变化不混入期权持仓差额', () => {
    const holding = 5950.32;
    const currentCollateral = 11401.15;
    const oldPoolCollateral = 11396.90;
    const finalGap = holding + currentCollateral;
    expect(readHoldingGap(finalGap, currentCollateral)).toBeCloseTo(holding, 8);
    expect(readHoldingGap(finalGap, oldPoolCollateral)).not.toBeCloseTo(holding, 2);
    expect(source).toContain('holdingGap: readConfirmedHoldingGap(finalGap, popupFinalGapByOrderId[memberKey]?.collateralValueU)');
    expect(source).toContain('onExposureGapChange(canonicalOrderId, finalGap, combinedCollateralValueU)');
  });
  it('只在第四项计一次担保，第三项保持纯持仓差额', () => {
    expect(readHoldingGap(17377.14, 11400.15)).toBeCloseTo(5976.99, 8);
    expect(readHoldingGap(0, 0)).toBe(0);
    expect(readHoldingGap(-4360.77, 0)).toBe(-4360.77);
  });
  it.each([null, undefined, '', NaN])('担保值尚未到齐%s时等待，不当作零值', missing => {
    expect(readHoldingGap(17377.14, missing)).toBeNull();
    expect(readHoldingGap(missing, 11400.15)).toBeNull();
  });
});
