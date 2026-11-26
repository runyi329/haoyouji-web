import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { createStockLotDownsideVersion, latestStockLotDownsideRule, stockLotDownsideAutoThreshold,
  stockLotDownsideEffectiveAt, validateStockLotDownsideStartDate,
  validateStockLotDownsideAutoDropPercent, isStockLotDownsideAutoRuleValid } from '../shared/stock-lot-downside';
import { portfolioCurrency, portfolioQuantityIsEmpty, isCryptoPortfolioSymbol } from '../shared/portfolio-instruments';

const portfolioSource = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
function tree(text: string) { return ts.createSourceFile('isolated.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS); }
function transpile(text: string) { return ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText; }
function routeSchema() {
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === 'setStockLotDownsideRule') {
      const findInput = (child: ts.Node) => {
        if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)
          && child.expression.name.text === 'input') expression = child.arguments[0];
        ts.forEachChild(child, findInput);
      };
      findInput(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree(routerSource));
  if (!expression) throw new Error('Missing stock downside input schema');
  return new Function('z', 'validateStockLotDownsideAutoDropPercent', transpile(`return (${expression.getText()});`))(
    z, validateStockLotDownsideAutoDropPercent) as z.ZodTypeAny;
}
function extractSave(bindings: Record<string, unknown>) {
  const node = tree(portfolioSource).statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'setStockLotDownsideRule');
  if (!node) throw new Error('Missing save function');
  const code = transpile(node.getText().replace(/^export\s+/, ''));
  return new Function(...Object.keys(bindings), `${code}\nreturn setStockLotDownsideRule;`)(...Object.values(bindings));
}
const schema = routeSchema();
const scope = { ledgerId: 37, categoryId: 81, lotId: 101, expectedVersion: 0, enabled: true };
const auto = { ...scope, activationMode: 'auto_drop' as const, autoDropPercent: 12.5 };
const manual = { ...scope, thresholdPrice: 80, downsidePercent: 20, startDate: '2026-11-26' };

describe('automatic stock input protocol: schema extracted only, no router execution', () => {
  it('accepts configurable decline and fixed server-side 0% without a manual date', () => {
    expect(schema.parse(auto)).toEqual(auto);
    expect(schema.parse({ ...auto, autoDropPercent: 0.01 })).toHaveProperty('autoDropPercent', 0.01);
    expect(schema.parse({ ...auto, autoDropPercent: 99.99 })).toHaveProperty('autoDropPercent', 99.99);
  });
  it.each([0.1, 12.3456789, 99.99999999, 1e-8])('API accepts exactly storable decline %s without transforming it', drop => {
    expect(schema.parse({ ...auto, autoDropPercent: drop })).toEqual({ ...auto, autoDropPercent: drop });
    expect(schema.parse({ ...auto, autoDropPercent: drop, enabled: false }).autoDropPercent).toBe(drop);
  });
  it.each([12.345678901, 1e-9])('API explicitly rejects in-range but unsupported precision %s', drop => {
    for (const enabled of [true, false]) {
      const result = schema.safeParse({ ...auto, autoDropPercent: drop, enabled });
      expect(result.success).toBe(false);
      if (result.success) throw new Error('Unsupported precision unexpectedly accepted');
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['autoDropPercent'], message: '自动触发下跌比例最多支持8位小数' }));
    }
  });
  it.each([0, -1, 100, 101, NaN, Infinity, null, '10', undefined])('rejects invalid decline %s', value => {
    expect(schema.safeParse({ ...auto, autoDropPercent: value }).success).toBe(false);
  });
  it.each([{ thresholdPrice: 87.5 }, { downsidePercent: 0 }, { startDate: '2026-11-26' },
    { triggeredAt: '2026-11-26T06:00:00Z' }, { armedAt: '2026-11-26T06:00:00Z' }, { autoEntryPrice: 100 },
    { triggerPrice: 80 }, { triggerSource: 'forged' }, { triggerQuoteAsOf: '2026-11-26T06:00:00Z' },
    { effectiveAt: '2026-11-26T06:00:00Z' }, { createdAt: '2026-11-26T06:00:00Z' },
    { baselineRawPrice: 87.5 }, { baselineCountedPrice: 87.5 }, { quoteAsOf: '2026-11-26T06:00:00Z' }])('rejects client-controlled automatic proof %o', override => {
    expect(schema.safeParse({ ...auto, ...override }).success).toBe(false);
  });
  it('old manual protocol remains accepted but cannot inject auto parameters', () => {
    expect(schema.parse(manual)).toEqual(manual);
    const preciseManual = { ...manual, thresholdPrice: 87.654321099, downsidePercent: 12.345678901 };
    expect(schema.parse(preciseManual)).toEqual(preciseManual);
    expect(schema.parse({ ...preciseManual, activationMode: 'manual' })).toEqual({ ...preciseManual, activationMode: 'manual' });
    expect(schema.safeParse({ ...manual, autoDropPercent: 10 }).success).toBe(false);
    expect(schema.safeParse({ ...manual, startDate: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...manual, startDate: '2026-02-30' }).success).toBe(false);
    expect(schema.safeParse({ ...auto, ledgerId: 52 }).success).toBe(false);
  });
});

function fixture(changes: Record<string, unknown> = {}) {
  const lot = { id: 101, symbol: '600000.SH', initialQuantity: 20, remainingQuantity: 20, unitCost: 100,
    openedEventId: 11, openedAt: '2026-11-20T10:00:00.000Z' };
  const lockedLot = { id: 101, ledger_owner_id: 7, symbol: lot.symbol, initial_quantity: 20,
    unit_cost: 100, opened_event_id: 11, opened_at: '2026-11-20 10:00:00', ...changes };
  const opening = { id: 11, ledger_id: 37, category_id: 81, event_type: 'buy', status: 'active', symbol: lot.symbol,
    quantity: 20, execution_price: 100, actual_traded_at: '2026-11-20 10:00:00', actual_traded_at_wall: '2026-11-20 10:00:00' };
  const conn = { execute: vi.fn(async (sql: string) => {
    if (!/^SELECT/.test(sql)) throw new Error('Pre-read may not write');
    return [[{ id: 101, symbol: lot.symbol, unit_cost: 100, actual_traded_at: '2026-11-20 10:00:00' }]];
  }) };
  const tx = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn(async (sql: string) => {
      if (!/^SELECT/.test(sql)) throw new Error('Unexpected source write in save extraction');
      if (sql.includes('FROM ledger_stock_lots l')) return [[lockedLot]];
      if (sql.includes('FROM ledger_stock_events WHERE')) return [[opening]];
      if (sql.includes('FROM ledger_stock_event_lot_allocations a')) return [[{ quantity: 0 }]];
      throw new Error('Unexpected locked read');
    }) };
  const permission = vi.fn(async () => {});
  const append = vi.fn(async (_: unknown, settings: any) => createStockLotDownsideVersion(settings, null));
  const ensure = vi.fn(); const dirty = vi.fn(); const invalidate = vi.fn();
  const bindings = { assertStockTagAccess: permission, getActiveLots: vi.fn(async () => [lot]),
    portfolioQuantityIsEmpty, isCryptoPortfolioSymbol, getDbConnection: vi.fn(async () => conn),
    getDbTransactionConnection: vi.fn(async () => tx), readStoredStockLotDownsideRules: vi.fn(async () => []),
    latestStockLotDownsideRule, stockLotDownsideEffectiveAt, stockLotDownsideAutoThreshold,
    createStockLotDownsideVersion, validateStockLotDownsideStartDate,
    calendarSourceNumber: (n: unknown) => Number(n), stockCurrency: portfolioCurrency,
    toBeijingWallClockIso: (s: string) => `${s.replace(' ', 'T')}+08:00`,
    toIso: (s: string) => new Date(s).toISOString(), ensureStockLotDownsideRulesTables: ensure,
    ensureStockCalendarResultTable: vi.fn(), appendStockLotDownsideRule: append,
    markStockCalendarResultDirty: dirty, invalidateStockLotDownsideRuleCache: invalidate,
    invalidateMemberStockReadCaches: vi.fn() };
  return { ...bindings, permission, append, ensure, dirty, invalidate, tx, save: extractSave(bindings) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-26T06:35:17.123Z')); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('automatic preset save: isolated function, all database and permissions injected', () => {
  it('derives native threshold from real unit cost, appends waiting, does not backdate to midnight', async () => {
    const f = fixture();
    const result = await f.save({ ...auto, userId: 7 });
    expect(result).toMatchObject({ activationMode: 'auto_drop', autoDropPercent: 12.5, autoEntryPrice: 100,
      thresholdPrice: 87.5, downsidePercent: 0, startDate: '2026-11-26', armedAt: '2026-11-26T06:35:17.123Z',
      effectiveAt: '2026-11-26T06:35:17.123Z', enabled: true });
    expect(result.triggeredAt).toBeUndefined(); expect(f.append).toHaveBeenCalledOnce();
    expect(f.tx.commit).toHaveBeenCalledOnce(); expect(f.tx.rollback).not.toHaveBeenCalled();
    expect(f.tx.execute.mock.calls[0]?.[0]).toContain('FROM ledger_stock_lots l');
    expect(f.tx.execute.mock.calls[1]?.[0]).toContain('FROM ledger_stock_events WHERE');
    expect(f.dirty).toHaveBeenCalledWith(f.tx, 81);
  });
  it.each([0.1, 12.3456789, 99.99999999, 1e-8])('isolated save keeps drop %s valid after decimal read-back', async drop => {
    const f = fixture();
    const result = await f.save({ ...schema.parse({ ...auto, autoDropPercent: drop }), userId: 7 });
    const stored = { ...result, autoDropPercent: Number(result.autoDropPercent.toFixed(8)),
      thresholdPrice: Number(result.thresholdPrice.toFixed(12)),
      baselineRawPrice: Number(result.baselineRawPrice.toFixed(12)),
      baselineCountedPrice: Number(result.baselineCountedPrice.toFixed(12)) };
    expect(stored.autoDropPercent).toBe(drop);
    expect(isStockLotDownsideAutoRuleValid(stored)).toBe(true);
    expect(f.append).toHaveBeenCalledOnce();
  });
  it.each([12.345678901, 1e-9])('service bypass still rejects unsupported drop %s before any migration or append', async drop => {
    const f = fixture();
    await expect(f.save({ ...auto, autoDropPercent: drop, userId: 7 })).rejects.toThrow('最多支持8位小数');
    expect(f.ensure).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
    expect(f.getDbTransactionConnection).not.toHaveBeenCalled();
    expect(f.dirty).not.toHaveBeenCalled();
  });
  it.each(['PREVIEW_READONLY', 'FAST_PREVIEW', 'DEV_BYPASS_AUTH'])('preview flag %s forbids all auto writes', async flag => {
    vi.stubEnv(flag, 'true'); const f = fixture();
    await expect(f.save({ ...auto, userId: 7 })).rejects.toThrow('预览模式');
    expect(f.ensure).not.toHaveBeenCalled(); expect(f.append).not.toHaveBeenCalled();
  });
  it('permission failure performs no migration or append', async () => {
    const f = fixture(); f.permission.mockRejectedValue(new Error('仅所有者'));
    await expect(f.save({ ...auto, userId: 8, isViewingAs: true })).rejects.toThrow('仅所有者');
    expect(f.ensure).not.toHaveBeenCalled(); expect(f.append).not.toHaveBeenCalled();
  });
  it.each([{ ledger_owner_id: 8 }, { unit_cost: 101 }, { symbol: '600001.SH' }, { initial_quantity: 21 }])('locked current state changed %o never appends', async change => {
    const f = fixture(change); await expect(f.save({ ...auto, userId: 7 })).rejects.toThrow();
    expect(f.append).not.toHaveBeenCalled(); expect(f.tx.commit).not.toHaveBeenCalled();
    expect(f.tx.rollback).toHaveBeenCalledOnce(); expect(f.tx.release).toHaveBeenCalledOnce();
  });
  it.each([{ thresholdPrice: 87.5 }, { downsidePercent: 0 }, { startDate: '2026-11-26' }, { autoDropPercent: 100 }])('service independently rejects malformed auto input %o', async change => {
    const f = fixture(); await expect(f.save({ ...auto, ...change, userId: 7 })).rejects.toThrow();
    expect(f.ensure).not.toHaveBeenCalled(); expect(f.append).not.toHaveBeenCalled();
  });
  it('manual remains a dated owner threshold version', async () => {
    const f = fixture(); const result = await f.save({ ...manual, userId: 7 });
    expect(result).toMatchObject({ thresholdPrice: 80, downsidePercent: 20, effectiveAt: '2026-11-25T16:00:00.000Z' });
    expect(result.activationMode).not.toBe('auto_drop');
  });
});
