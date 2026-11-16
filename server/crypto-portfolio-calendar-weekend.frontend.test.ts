import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../client/src/pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LedgerDetailAA.tsx', source, ts.ScriptTarget.Latest, true);
function fn(name: string) {
  const node = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node) throw new Error(`missing ${name}`);
  return node.getText(ast);
}

describe('LedgerDetailAA crypto natural-day calendar exceptions', () => {
  it('pure date predicate accepts only the concrete crypto date', () => {
    const text = fn('hasCryptoCalendarPointForDate');
    expect(text).toContain('point?.date === date');
    expect(text).toContain('isCryptoPortfolioCalendarPoint(point)');
    expect(text).not.toContain('month');
  });

  it('weekend/holiday stock cells bypass label and disabled state only for crypto points', () => {
    expect(source).toContain('const hasCryptoPoint = isSelectedStockPortfolio && hasCryptoCalendarPointForDate(stockCalendarPoints, dayDateStr2)');
    expect(source).toContain('const isNonTrading = nonTradingLabel !== null && !hasCryptoPoint');
    expect(source).toContain('const canOpenCalendarCell = !isNonTrading');
    expect(source).toContain('stockDayPlaceholder');
  });

  it('pending crypto remains unknown and ready values are not replaced by zero', () => {
    const text = fn('cryptoCalendarPointStatusForDate');
    expect(text).toContain("'ready' | 'pending' | null");
    expect(text).toContain("return matching.length > 0 ? 'pending' : null");
    expect(source).toContain('policyVersion: point.policyVersion');
  });

  it('summary bypasses A-share gray cells by exact crypto date, not by month', () => {
    expect(source).toContain('const summaryCryptoDates = new Set<string>()');
    expect(source).toContain('summaryCryptoDates.add(point.date)');
    expect(source).toContain('const isCryptoDate = summaryCryptoDates.has(dateStr)');
    expect(source).toContain('const isNonTrading = sNonTradingLabel !== null && !isCryptoDate');
    expect(source).not.toContain('summaryCryptoDates.has(dateStr.slice(0, 7))');
  });

  it('ordinary stock/handwritten labels retain A-share non-trading behavior', () => {
    expect(source).toContain("if (dow === 0) return '周日'");
    expect(source).toContain("if (dow2 === 6) return '周六'");
    expect(source).toContain('disabled={!canOpenCalendarCell}');
    expect(source).toContain('disabled={!canOpenCalendarDayDetail}');
  });
});
