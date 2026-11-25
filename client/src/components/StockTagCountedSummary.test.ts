import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { stockTagCountedHistoricalPnl, stockTagCountedLotValues, stockTagCountedMemberFloatingPnl, stockTagCountedValue, stockTagServerAggregate } from './StockTagCountedSummary';

const source = readFileSync(new URL('../pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('StockTagPortfolio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function evaluate(name: string, scope: Record<string, any>): any {
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!expression) throw new Error(`Missing actual portfolio expression: ${name}`);
  const js = ts.transpileModule(`const actual = ${expression.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(scope), `${js}; return actual;`)(...Object.values(scope));
}
function holdings() {
  return [
    { symbol: 'AAPL', stockName: '苹果', nativeCurrency: 'USD', nativeUnitCost: 8, nativeMarketPrice: 9, marketPrice: 9, positionNumber: 1, lot: { id: 11, unitCost: 8 }, accountHolding: { quantity: 100, costValue: 800, marketValue: 900, countedMarketValue: 820, floatingPnl: 100, countedFloatingPnl: 20, nativeMarketValue: 900 }, myHolding: { quantity: 100, entryPrice: 8, marketValue: 900, nativeMarketValue: 900 } },
    { symbol: 'AAPL', stockName: '苹果', nativeCurrency: 'USD', nativeUnitCost: 8, nativeMarketPrice: 9, marketPrice: 9, positionNumber: 2, lot: { id: 12, unitCost: 8 }, accountHolding: { quantity: 200, costValue: 1600, marketValue: 1800, countedMarketValue: 1680, floatingPnl: 200, countedFloatingPnl: 80, nativeMarketValue: 1800 }, myHolding: { quantity: 200, entryPrice: 8, marketValue: 1800, nativeMarketValue: 1800 } },
  ];
}
const base = () => ({ stockTagCountedLotValues, stockTagCountedMemberFloatingPnl, stockTagCountedValue, stockTagServerAggregate,
  countedHistoricalPnlCny: (lot: any, field: 'realizedPnl' | 'accountNetProfit') => stockTagCountedHistoricalPnl(lot, field, 'USD', lot[field]),
  useCountedSummary: true, participantView: false, hasCrypto: false, tagHoldingLots: holdings(),
  summary: { costValue: 2400, marketValue: 2500, floatingPnl: 100, totalPnl: 150 },
  toCny: (value: number | null) => value, visibleMemberLots: [
    { lotId: 11, floatingPnl: -100, countedFloatingPnl: -20 },
    { lotId: 12, floatingPnl: -200, countedFloatingPnl: -80 },
  ],
});

describe('R1汇总采用计入口径，逐笔仍展示真实价格和浮盈', () => {
  it('0/null不回退真实值，旧服务器缺字段才fallback', () => {
    expect(stockTagCountedValue(0, 100)).toBe(0);
    expect(stockTagCountedValue(null, 100)).toBeNull();
    expect(stockTagCountedValue(undefined, 100)).toBe(100);
    expect(stockTagServerAggregate({ floatingPnl: 0 }, 'floatingPnl', 300)).toBe(0);
    expect(stockTagServerAggregate({ floatingPnl: null }, 'floatingPnl', 300)).toBeNull();
  });
  it('未来平仓聚合读取冻结计入金额，0/null不回退，外币缺冻结金额不拿今日汇率补', () => {
    const lot = { countedRealizedPnl: 20, countedRealizedPnlCny: 133, fxLocked: true };
    expect(stockTagCountedHistoricalPnl(lot, 'realizedPnl', 'USD', 666)).toBe(133);
    expect(stockTagCountedHistoricalPnl({ countedRealizedPnl: 0, countedRealizedPnlCny: 0 }, 'realizedPnl', 'USDT', 100)).toBe(0);
    expect(stockTagCountedHistoricalPnl({ countedRealizedPnl: 0, countedRealizedPnlCny: 25 }, 'realizedPnl', 'USD', 100)).toBe(25);
    expect(stockTagCountedHistoricalPnl({ countedRealizedPnl: 20 }, 'realizedPnl', 'USD', 100)).toBeNull();
    expect(stockTagCountedHistoricalPnl({ countedRealizedPnl: 20, countedRealizedPnlCny: null }, 'realizedPnl', 'USD', 100)).toBeNull();
    expect(stockTagCountedHistoricalPnl({ countedRealizedPnl: 0 }, 'realizedPnl', 'CNY', 100)).toBe(0);
    expect(stockTagCountedHistoricalPnl({}, 'realizedPnl', 'USD', 50)).toBe(50);
    expect(lot).toEqual({ countedRealizedPnl: 20, countedRealizedPnlCny: 133, fxLocked: true });
  });
  it('同股票两个lot独立汇总20+80，不重复symbol的100合计', () => {
    const lots = [stockTagCountedLotValues({ countedMarketValue: 820, countedFloatingPnl: 20 }, 900, 100), stockTagCountedLotValues({ countedMarketValue: 1680, countedFloatingPnl: 80 }, 1800, 200)];
    expect(lots.reduce((n, lot) => n + lot.floatingPnl!, 0)).toBe(100);
    expect(lots.reduce((n, lot) => n + lot.marketValue!, 0)).toBe(2500);
  });
  it('运行真实账户汇总表达式：合计2500/100，单笔仍900/100和1800/200', () => {
    const scope = base();
    const aggregate = evaluate('accountHoldingSummary', scope);
    expect(aggregate.marketValue).toBe(2500); expect(aggregate.floatingPnl).toBe(100);
    expect(aggregate.details.map((row: any) => row.currentValue)).toEqual([900, 1800]);
    expect(aggregate.details.map((row: any) => row.floatingPnl)).toEqual([100, 200]);
    expect(scope.tagHoldingLots.map(row => row.nativeMarketPrice)).toEqual([9, 9]);
  });
  it('真实客户汇总表达式：服务器计入盈亏优先，不用单笔真实浮盈重加覆盖', () => {
    const scope = { ...base(), participantView: true, summary: { costValue: 2400, marketValue: 2500, floatingPnl: -100, totalPnl: -150 } };
    const aggregate = evaluate('memberHoldingSummary', scope);
    expect(aggregate.marketValue).toBe(2500); expect(aggregate.floatingPnl).toBe(-100);
    expect(aggregate.details.map((row: any) => row.floatingPnl)).toEqual([-100, -200]);
    expect(aggregate.details.map((row: any) => row.countedFloatingPnl)).toEqual([-20, -80]);
    const total = evaluate('memberTotalPnlSummary', { ...scope, memberHoldingSummary: aggregate, memberClosedLotsSummary: { realizedPnl: -50, closedCostValue: 1000 } });
    expect(total.totalPnl).toBe(-150); expect(total.realizedPnl).toBe(-50);
  });
  it('持有/结束/全部股票盈亏筛选源每lot计入，固定结束记录原数不回改', () => {
    const scope = { ...base(), canEdit: true, accountRealizedLots: [{ lotId: 10, stockName: '苹果', symbol: 'AAPL', soldQuantity: 100, buyValue: 800, accountNetProfit: 50 }], historicalValueCny: (lot: any, field: string) => lot[field] };
    const rows = evaluate('stockNameProfitRows', scope);
    const sum = (state?: string) => rows.filter((row: any) => !state || row.state === state).reduce((n: number, row: any) => n + row.pnl, 0);
    expect(sum('holding')).toBe(100); expect(sum('closed')).toBe(50); expect(sum()).toBe(150);
    expect(rows.map((row: any) => row.lotId)).toEqual([11, 12, 10]);
  });
  it('新平仓原收益50不改，已结束汇总计入10，全部汇总为持有100加结束10', () => {
    const lot = { lotId: 10, stockName: '苹果', symbol: 'AAPL', soldQuantity: 100, buyValue: 800, accountNetProfit: 50, countedAccountNetProfit: 10, countedAccountNetProfitCny: 10 };
    const rows = evaluate('stockNameProfitRows', { ...base(), canEdit: true, accountRealizedLots: [lot], historicalValueCny: (row: any, field: string) => row[field] });
    expect(rows.filter((row: any) => row.state === 'closed').map((row: any) => row.pnl)).toEqual([10]);
    expect(rows.reduce((total: number, row: any) => total + row.pnl, 0)).toBe(110);
    expect(lot.accountNetProfit).toBe(50);
  });
  it('账户总体收益优先服务端totalPnl，日结优先已按计入口径计算dailyChange', () => {
    expect(evaluate('accountTotalPnl', { ...base(), displayedTopPnl: 100, accountRealizedPnl: 50, fallbackAccountTotalPnl: 150 })).toBe(150);
    expect(evaluate('dailyPnlFromSnapshots', { ...base(), summary: { dailyChange: 0, latestSnapshot: { totalPnl: 300 }, priorSnapshot: { totalPnl: 200 } } })).toBe(0);
  });
  it('旧本人接口缺逐笔盈亏字段，进行中红色汇总使用该本人数量和真实价，不误显示全部未知', () => {
    const scope = { ...base(), participantView: true, visibleMemberLots: [
      { id: 11, quantity: 100, entryPrice: 8 }, { id: 12, quantity: 200, entryPrice: 8 },
    ] };
    const summary = evaluate('memberHoldingSummary', scope);
    expect(summary.details.map((row: any) => row.countedFloatingPnl)).toEqual([-100, -200]);
    const rows = evaluate('memberStockProfitRows', { ...scope, memberHoldingSummary: summary, memberRealizedLots: [] });
    expect(rows.map((row: any) => row.pnl)).toEqual([-100, -200]);
  });
  it('已给计入0或pending的新版接口绝不回退真实盈亏，原币跨币转换仍由调用方一次处理', () => {
    expect(stockTagCountedMemberFloatingPnl({ countedFloatingPnl: 0, floatingPnl: 100 }, 9)).toBe(0);
    expect(stockTagCountedMemberFloatingPnl({ countedFloatingPnl: null, floatingPnl: 100, quantity: 100, entryPrice: 8 }, 9)).toBeNull();
    expect(stockTagCountedMemberFloatingPnl({ floatingPnl: null, quantity: 100, entryPrice: 8 }, 9)).toBeNull();
    expect(stockTagCountedMemberFloatingPnl({ quantity: 3, entryPrice: 10 }, 8)).toBe(6);
    expect(stockTagCountedMemberFloatingPnl({ quantity: 999, remainingQuantity: 2, entryPrice: 10 }, 8)).toBe(4);
  });
  it('缺报价、本人数量或真实入场价仍未知，已结束收益字段不被兼容函数修改', () => {
    expect(stockTagCountedMemberFloatingPnl({ quantity: 3, entryPrice: 10 }, null)).toBeNull();
    expect(stockTagCountedMemberFloatingPnl({ entryPrice: 10 }, 8)).toBeNull();
    expect(stockTagCountedMemberFloatingPnl({ quantity: 3, entryPrice: null, unitCost: 10 }, 8)).toBeNull();
    const row = { quantity: 2, entryPrice: 10, realizedPnl: 55 }; const before = { ...row };
    expect(stockTagCountedMemberFloatingPnl(row, 8)).toBe(4); expect(row).toEqual(before);
    const scope = { ...base(), participantView: true, visibleMemberLots: [] };
    expect(evaluate('memberHoldingSummary', scope).details.map((row: any) => row.countedFloatingPnl)).toEqual([null, null]);
  });
});
