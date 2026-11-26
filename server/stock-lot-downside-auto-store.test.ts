import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./db', () => { throw new Error('Forbidden database import in store isolation test'); });
vi.mock('./ledger-stock-portfolio', () => { throw new Error('Forbidden full portfolio import'); });
vi.mock('./routers', () => { throw new Error('Forbidden router import'); });
vi.mock('./_core/index', () => { throw new Error('Forbidden startup import'); });
vi.mock('./price-scanner', () => { throw new Error('Forbidden quote source import'); });
vi.mock('./crypto-portfolio-quotes', () => { throw new Error('Forbidden crypto source import'); });
import { appendStockLotDownsideRule, ensureStockLotDownsideRulesTables, readStockLotDownsideRules,
  readLatestStockLotDownsideRuleForUpdate } from './stock-lot-downside-rules';
const input = { ledgerId: 37, categoryId: 90250, lotId: 1, userId: 7, currency: 'USD' as const,
  enabled: true, activationMode: 'auto_drop' as const, autoDropPercent: 10, autoEntryPrice: 100, expectedVersion: 0,
  effectiveAt: '2026-11-25T20:00:00.456Z', currentRawPrice: NaN };
const stored = { ledger_id: 37, category_id: 90250, lot_id: 1, user_id: 7, currency: 'USD', version: 1, enabled: 1,
  threshold_price: '90', downside_percent: '0', effective_at: input.effectiveAt, created_at: input.effectiveAt,
  start_date: '2026-11-26', baseline_raw_price: '90', baseline_counted_price: '90', baseline_status: 'ready', baseline_source: 'owner_threshold',
  activation_mode: 'auto_drop', auto_drop_percent: '10', auto_entry_price: '100', armed_at: input.effectiveAt };
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Forbidden network'); })));
afterEach(() => vi.unstubAllGlobals());
describe('new auto store pure mocked connection', () => {
  it('waiting append persists precision UTC, Beijing date only label, fixed zero basis and no faux quote', async () => {
    const execute = vi.fn(async (sql: string, _values?: unknown[]) => /^SELECT/.test(sql) ? [[]] : [{ affectedRows: 1 }]);
    const result = await appendStockLotDownsideRule({ execute }, input);
    expect(result).toMatchObject({ version: 1, effectiveAt: input.effectiveAt, armedAt: input.effectiveAt, startDate: '2026-11-26',
      thresholdPrice: 90, downsidePercent: 0, baselineRawPrice: 90, baselineCountedPrice: 90, activationMode: 'auto_drop' });
    const [sql, values] = execute.mock.calls[1]!;
    expect(sql).toContain('activation_mode,auto_drop_percent,auto_entry_price,armed_at,triggered_at');
    expect(values!.slice(8, 14)).toEqual(['2026-11-25 20:00:00.456', 90, 90, 'USD', null, '2026-11-25 20:00:00.456']);
    expect(values!.slice(18)).toEqual(['auto_drop', 10, 100, '2026-11-25 20:00:00.456', null, null, null, null]);
    expect(execute.mock.calls.every(([sql]) => /^SELECT|^INSERT/.test(sql))).toBe(true);
  });
  it('append + decode triggered audit keep three distinct instants, read performs SELECT only', async () => {
    const execute = vi.fn(async (sql: string, _values?: unknown[]) => /^SELECT/.test(sql) ? [[stored]] : [{ affectedRows: 1 }]);
    const result = await appendStockLotDownsideRule({ execute }, { ...input, expectedVersion: 1, armedAt: input.effectiveAt,
      effectiveAt: '2026-11-25T20:01:30.987Z', triggeredAt: '2026-11-25T20:01:30.987Z',
      triggerPrice: 89, triggerQuoteAsOf: '2026-11-25T20:01:30.123Z', triggerSource: 'Yahoo Finance' });
    const [sql, values] = execute.mock.calls[1]!;
    expect(result).toMatchObject({ version: 2, armedAt: input.effectiveAt, triggeredAt: '2026-11-25T20:01:30.987Z',
      triggerQuoteAsOf: '2026-11-25T20:01:30.123Z', triggerPrice: 89 });
    const columns = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map(c => c.trim());
    const persisted = Object.fromEntries(columns.map((c, i) => [c, values![i]]));
    for (const name of ['effective_at', 'created_at', 'armed_at', 'triggered_at', 'trigger_quote_as_of']) {
      persisted[name] = String(persisted[name]).replace(' ', 'T') + 'Z';
    }
    const read = vi.fn(async (_sql: string, _params?: number[]) => [[persisted]]);
    expect((await readStockLotDownsideRules({ execute: read }, 37, 90250))[0]).toMatchObject(result);
    expect(read.mock.calls[0]![0]).toContain("LEFT(DATE_FORMAT(armed_at,'%Y-%m-%dT%H:%i:%s.%f'),23)");
    expect(read.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  it('named missing auto column falls back to manual/date schema preserving dates and owner basis', async () => {
    const legacy = { ...stored, activation_mode: undefined, auto_drop_percent: undefined, auto_entry_price: undefined, armed_at: undefined };
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes('activation_mode')) throw Object.assign(new Error("Unknown column 'activation_mode' in field list"), { errno: 1054 });
      return [[legacy]];
    });
    expect((await readStockLotDownsideRules({ execute }, 37, 90250))[0]).toMatchObject({ startDate: '2026-11-26',
      baselineStatus: 'ready', baselineSource: 'owner_threshold', effectiveAt: input.effectiveAt });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  it('oldest schema fallback is SELECT-only; missing table never migrates', async () => {
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes('activation_mode')) throw Object.assign(new Error("Unknown column 'activation_mode'"), { errno: 1054 });
      if (sql.includes('start_date')) throw Object.assign(new Error("Unknown column 'start_date'"), { errno: 1054 });
      return [[{ ...stored, start_date: undefined }]];
    });
    expect((await readStockLotDownsideRules({ execute }, 37, 90250))[0]!.effectiveAt).toBe(input.effectiveAt);
    expect(execute).toHaveBeenCalledTimes(3); expect(execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
    const missing = { execute: vi.fn(async () => { throw Object.assign(new Error('no table'), { errno: 1146 }); }) };
    expect(await readStockLotDownsideRules(missing, 37, 90250)).toEqual([]); expect(missing.execute).toHaveBeenCalledTimes(1);
  });
  it('non-schema DB errors never retry/downgrade as legacy', async () => {
    const execute = vi.fn(async () => { throw Object.assign(new Error('access denied'), { errno: 1045 }); });
    await expect(readStockLotDownsideRules({ execute }, 37, 90250)).rejects.toThrow('access denied'); expect(execute).toHaveBeenCalledTimes(1);
  });
  it('partially migrated auto columns never downgrade a waiting auto rule into manual 0%', async () => {
    const execute = vi.fn(async () => { throw Object.assign(new Error("Unknown column 'triggered_at' in field list"), { errno: 1054 }); });
    await expect(readStockLotDownsideRules({ execute }, 37, 90250)).rejects.toThrow('triggered_at');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('migration helper is explicit only and adds auto fields with DATETIME(3)', async () => {
    const execute = vi.fn(async (sql: string) => sql.includes('information_schema')
      ? [[{ COLUMN_NAME: 'start_date' }, { COLUMN_NAME: 'baseline_status' }, { COLUMN_NAME: 'baseline_source' }, { COLUMN_NAME: 'holding_start_at' }]]
      : [{ affectedRows: 0 }]);
    await ensureStockLotDownsideRulesTables({ execute });
    expect(execute.mock.calls.map(([sql]) => sql).join('\n')).toContain('ADD COLUMN armed_at DATETIME(3) NULL');
    expect(execute.mock.calls.map(([sql]) => sql).join('\n')).toContain('ADD COLUMN triggered_at DATETIME(3) NULL');
    expect(execute.mock.calls.map(([sql]) => sql).join('\n')).toContain('ADD COLUMN trigger_quote_as_of DATETIME(3) NULL');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('FOR UPDATE latest is scoped and DESC even when older effective dates exist', async () => {
    const execute = vi.fn(async (_sql: string, _params?: number[]) => [[stored]]);
    expect(await readLatestStockLotDownsideRuleForUpdate({ execute }, 37, 90250, 1)).toMatchObject({ version: 1, armedAt: input.effectiveAt });
    expect(execute.mock.calls[0]).toEqual([expect.stringContaining('ORDER BY version DESC LIMIT 1 FOR UPDATE'), [37, 90250, 1]]);
  });
});
