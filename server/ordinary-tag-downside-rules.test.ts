import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ tx: vi.fn() }));
vi.mock('./db', () => ({ getDbTransactionConnection: db.tx }));
import { ORDINARY_TAG_DOWNSIDE_RULES_DDL, readAllOrdinaryTagDownsideRules,
  readOrdinaryTagDownsideRules, setOrdinaryTagDownsideRule } from './ordinary-tag-downside-rules';
const input = { ledgerId: 37, categoryId: 10, userId: 7, enabled: true, thresholdAmount: 100,
  downsidePercent: 20, startDate: '2026-11-01', expectedVersion: 0 };
const stored = (patch: Record<string, unknown> = {}) => ({ ledger_id: 37, category_id: 10, user_id: 7,
  version: 1, enabled: 1, threshold_amount: '100.000000000000', downside_percent: '20.00000000',
  start_date: '2026-11-01', created_at: '2026-11-25T08:30:00.123000Z', ...patch });
const category = { id: 10, ledgerId: 37, name: '普通标签', parentId: null, isDefault: 0, accountingMode: 'manual_balance' };
function fixture(options: { owner?: number; category?: Record<string, unknown>; lockedCategory?: Record<string, unknown>;
  lockedOwner?: number; preRules?: any[]; lockedRules?: any[]; missing?: boolean; insertError?: unknown;
  affectedRows?: number; commitError?: unknown; beginError?: unknown; rollbackError?: unknown; ddlError?: unknown } = {}) {
  const log: string[] = [];
  const connection = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      log.push(sql);
      if (sql.startsWith('SELECT id,ownerId FROM ledgers')) return [[{ id: 37,
        ownerId: sql.includes('FOR UPDATE') ? (options.lockedOwner ?? options.owner ?? 7) : (options.owner ?? 7) }]];
      if (sql.includes('FROM ledger_categories')) return [[{ ...category, ...(options.category ?? {}),
        ...(sql.includes('FOR UPDATE') ? options.lockedCategory ?? {} : {}) }]];
      if (sql.startsWith('CREATE TABLE')) { if (options.ddlError) throw options.ddlError; return [{ affectedRows: 0 }]; }
      if (sql.includes('FROM ledger_ordinary_tag_downside_rules')) {
        if (!sql.includes('FOR UPDATE') && options.missing) throw Object.assign(new Error('missing'), { errno: 1146 });
        return [sql.includes('FOR UPDATE') ? options.lockedRules ?? options.preRules ?? [] : options.preRules ?? []];
      }
      if (sql.startsWith('INSERT INTO ledger_ordinary_tag_downside_rules')) {
        if (options.insertError) throw options.insertError;
        expect(params).toHaveLength(9);
        return [{ affectedRows: options.affectedRows ?? 1 }];
      }
      throw new Error(`Unexpected SQL in offline mock: ${sql}`);
    }),
    beginTransaction: vi.fn(async () => { log.push('BEGIN'); if (options.beginError) throw options.beginError; }),
    commit: vi.fn(async () => { log.push('COMMIT'); if (options.commitError) throw options.commitError; }),
    rollback: vi.fn(async () => { log.push('ROLLBACK'); if (options.rollbackError) throw options.rollbackError; }),
    release: vi.fn(async () => { log.push('RELEASE'); }),
  };
  db.tx.mockResolvedValue(connection);
  return { connection, log, writes: () => log.filter(sql => /^(CREATE|INSERT|UPDATE|DELETE|ALTER)/.test(sql)) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PREVIEW_READONLY', 'false'); vi.stubEnv('FAST_PREVIEW', 'false'); vi.stubEnv('DEV_BYPASS_AUTH', 'false');
});
describe('readonly batch exact rule decoding without DDL/cache', () => {
  it('whole ledger in one scoped SELECT, groups all dates/versions and percent true zero', async () => {
    const connection = { execute: vi.fn(async () => [[stored({ version: 1, start_date: '1000-01-01', downside_percent: '0', enabled: 0 }),
      stored({ version: 2, start_date: '9999-12-31' }), stored({ category_id: 11 })]]) };
    const result = await readAllOrdinaryTagDownsideRules(connection, 37);
    expect(result.get(10)?.[0]).toEqual({ ledgerId: 37, categoryId: 10, userId: 7, version: 1, enabled: false,
      thresholdAmount: 100, downsidePercent: 0, startDate: '1000-01-01', createdAt: '2026-11-25T08:30:00.123000Z' });
    expect(result.get(10)?.[1].startDate).toBe('9999-12-31'); expect(result.size).toBe(2);
    expect(connection.execute.mock.calls).toHaveLength(1);
    expect(connection.execute.mock.calls[0]).toEqual([expect.stringContaining('WHERE ledger_id=? ORDER BY category_id,version'), [37]]);
    await readAllOrdinaryTagDownsideRules(connection, 37); expect(connection.execute).toHaveBeenCalledTimes(2);
  });
  it.each([{ code: 'ER_NO_SUCH_TABLE' }, { errno: 1146 }])('missing table returns empty Map/array without cache or DDL %j', async error => {
    const connection = { execute: vi.fn(async () => { throw Object.assign(new Error('missing'), error); }) };
    expect(await readAllOrdinaryTagDownsideRules(connection, 37)).toEqual(new Map());
    expect(await readAllOrdinaryTagDownsideRules(connection, 37)).toEqual(new Map());
    expect(await readOrdinaryTagDownsideRules(connection, 37, 10)).toEqual([]);
    expect(connection.execute).toHaveBeenCalledTimes(3);
    expect(connection.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  it('scoped read uses bound ledger/category and no DDL; foreign ledger returns empty without SQL', async () => {
    const connection = { execute: vi.fn(async () => [[stored()]]) };
    expect(await readOrdinaryTagDownsideRules(connection, 37, 10)).toHaveLength(1);
    expect(connection.execute.mock.calls[0]).toEqual([expect.stringContaining('WHERE ledger_id=? AND category_id=?'), [37, 10]]);
    expect(await readAllOrdinaryTagDownsideRules(connection, 38)).toEqual(new Map());
    expect(await readOrdinaryTagDownsideRules(connection, 38, 10)).toEqual([]);
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });
  it.each([{ downside_percent: null }, { threshold_amount: '' }, { start_date: '2026-02-30' }, { enabled: 2 },
    { ledger_id: 38 }, { category_id: null }, { created_at: '2026-11-25 08:30:00' }])('damaged source refuses fake zero/basis %j', async patch => {
    const connection = { execute: vi.fn(async () => [[stored(patch)]]) };
    await expect(readAllOrdinaryTagDownsideRules(connection, 37)).rejects.toThrow();
  });
  it('scoped source exact category validation and real query failures propagate', async () => {
    await expect(readOrdinaryTagDownsideRules({ execute: vi.fn(async () => [[stored({ category_id: 11 })]]) }, 37, 10)).rejects.toThrow('范围');
    await expect(readAllOrdinaryTagDownsideRules({ execute: vi.fn(async () => { throw new Error('timeout'); }) }, 37)).rejects.toThrow('timeout');
  });
});
describe('save guards before connection, actual owner independently checked', () => {
  it.each(['PREVIEW_READONLY', 'FAST_PREVIEW', 'DEV_BYPASS_AUTH'])('preview/DEV %s prohibited before connection', async variable => {
    vi.stubEnv(variable, 'true');
    await expect(setOrdinaryTagDownsideRule(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.tx).not.toHaveBeenCalled();
  });
  it('viewAs prohibited before any connection', async () => {
    await expect(setOrdinaryTagDownsideRule({ ...input, isViewingAs: true })).rejects.toThrow('代看');
    expect(db.tx).not.toHaveBeenCalled();
  });
  it.each([{ ledgerId: 38 }, { categoryId: 0 }, { userId: 0 }, { thresholdAmount: 0 }, { thresholdAmount: -1 },
    { thresholdAmount: NaN }, { thresholdAmount: null }, { downsidePercent: -1 }, { downsidePercent: 101 },
    { downsidePercent: null }, { startDate: '2026-02-30' }, { startDate: '0999-01-01' }, { startDate: '10000-01-01' },
    { startDate: '20261101' }, { enabled: undefined }, { expectedVersion: -1 }, { expectedVersion: 1.5 }])('invalid input rejects before DB %j', async patch => {
    await expect(setOrdinaryTagDownsideRule({ ...input, ...patch } as typeof input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.tx).not.toHaveBeenCalled();
  });
  it.each(['admin', 'super_admin', 'systemadmin', 'owner'])('nonactual owner role %s cannot save or ensure table', async systemRole => {
    const f = fixture({ owner: 8 });
    await expect(setOrdinaryTagDownsideRule({ ...input, systemRole })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.writes()).toEqual([]); expect(f.connection.beginTransaction).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it.each([{ ledgerId: 38 }, { parentId: 1 }, { isDefault: 1 }, { accountingMode: 'stock_portfolio' },
    { name: '' }, { id: 11 }])('illegal category cannot ensure table %j', async categoryPatch => {
    const f = fixture({ category: categoryPatch });
    await expect(setOrdinaryTagDownsideRule(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.writes()).toEqual([]); expect(f.connection.beginTransaction).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it('disabled still requires explicit valid settings, no failed fallback', async () => {
    await expect(setOrdinaryTagDownsideRule({ ...input, enabled: false, thresholdAmount: 0 })).rejects.toThrow('大于0');
    expect(db.tx).not.toHaveBeenCalled();
  });
});
describe('lazy authorized DDL, ledger-first locking, append-only CAS and transaction cleanup', () => {
  it('new table first version 1; true owner role member allowed; success after commit', async () => {
    const f = fixture({ missing: true });
    const result = await setOrdinaryTagDownsideRule({ ...input, systemRole: 'member', downsidePercent: 0, startDate: '9999-12-31' });
    expect(result).toMatchObject({ success: true, rule: { ledgerId: 37, version: 1, downsidePercent: 0,
      enabled: true, startDate: '9999-12-31', thresholdAmount: 100, userId: 7 } });
    expect(Number.isFinite(Date.parse(result.rule.createdAt))).toBe(true);
    expect(f.writes()).toHaveLength(2);
    expect(f.writes()[0]).toBe(ORDINARY_TAG_DOWNSIDE_RULES_DDL);
    expect(f.writes()[1]).toMatch(/^INSERT INTO ledger_ordinary_tag_downside_rules/);
    const locks = f.log.filter(sql => sql.includes('FOR UPDATE'));
    expect(locks[0]).toContain('FROM ledgers');
    expect(locks[1]).toContain('FROM ledger_categories');
    expect(locks[2]).toContain('FROM ledger_ordinary_tag_downside_rules');
    expect(f.log.indexOf('BEGIN')).toBeGreaterThan(f.log.indexOf(ORDINARY_TAG_DOWNSIDE_RULES_DDL));
    expect(f.log.slice(-2)).toEqual(['COMMIT', 'RELEASE']);
    expect(f.connection.rollback).not.toHaveBeenCalled();
  });
  it('next version 2 appends only, enabled false fully explicit', async () => {
    const f = fixture({ preRules: [stored()] });
    const result = await setOrdinaryTagDownsideRule({ ...input, expectedVersion: 1, enabled: false, thresholdAmount: 75,
      downsidePercent: 100, startDate: '1000-01-01' });
    expect(result.rule).toMatchObject({ version: 2, enabled: false, thresholdAmount: 75, downsidePercent: 100, startDate: '1000-01-01' });
    expect(f.connection.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT'))?.[1]?.slice(0, 8))
      .toEqual([37, 10, 7, 2, 0, 75, 100, '1000-01-01']);
    expect(f.writes().every(sql => /^CREATE TABLE IF NOT EXISTS ledger_ordinary_tag_downside_rules|^INSERT INTO ledger_ordinary_tag_downside_rules/.test(sql))).toBe(true);
  });
  it('stale preflight CAS rejects before DDL, version0 only if no prior row', async () => {
    const f = fixture({ preRules: [stored()] });
    await expect(setOrdinaryTagDownsideRule(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.writes()).toEqual([]); expect(f.connection.beginTransaction).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it('concurrent latest changes under lock => CAS rollback, no INSERT', async () => {
    const f = fixture({ lockedRules: [stored()] });
    await expect(setOrdinaryTagDownsideRule(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.writes()).toEqual([ORDINARY_TAG_DOWNSIDE_RULES_DDL]);
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.log.slice(-2)).toEqual(['ROLLBACK', 'RELEASE']);
  });
  it.each([{ parentId: 1 }, { isDefault: 1 }, { accountingMode: 'stock_portfolio' }, { ledgerId: 38 }])('category changed under first lock rejected and rolled back %j', async lockedCategory => {
    const f = fixture({ lockedCategory });
    await expect(setOrdinaryTagDownsideRule(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.writes()).toHaveLength(1);
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it('owner changed under lock cannot append', async () => {
    const f = fixture({ lockedOwner: 8 });
    await expect(setOrdinaryTagDownsideRule(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.writes()).toHaveLength(1);
  });
  it.each([{ code: 'ER_DUP_ENTRY' }, { errno: 1062 }])('duplicate unique version maps CONFLICT, rollback/release %j', async code => {
    const f = fixture({ insertError: Object.assign(new Error('duplicate'), code) });
    await expect(setOrdinaryTagDownsideRule(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.release).toHaveBeenCalledOnce();
    expect(f.connection.commit).not.toHaveBeenCalled();
  });
  it('failed insert and commit never returns success, always rollback/release', async () => {
    for (const options of [{ affectedRows: 0 }, { insertError: new Error('insert failed') }, { commitError: new Error('commit failed') }]) {
      const f = fixture(options);
      await expect(setOrdinaryTagDownsideRule(input)).rejects.toThrow();
      expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.release).toHaveBeenCalledOnce();
    }
  });
  it('begin/DDL errors release without false transaction success', async () => {
    for (const options of [{ beginError: new Error('begin failed') }, { ddlError: new Error('DDL failed') }]) {
      const f = fixture(options);
      await expect(setOrdinaryTagDownsideRule(input)).rejects.toThrow();
      expect(f.connection.release).toHaveBeenCalledOnce(); expect(f.connection.commit).not.toHaveBeenCalled();
    }
  });
  it('rollback failure surfaces both errors and release still happens', async () => {
    const f = fixture({ insertError: new Error('insert failed'), rollbackError: new Error('rollback failed') });
    await expect(setOrdinaryTagDownsideRule(input)).rejects.toBeInstanceOf(AggregateError);
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it('DDL index is tenant/category/version unique; writes never touch principal records or wallets', async () => {
    expect(ORDINARY_TAG_DOWNSIDE_RULES_DDL).toContain('UNIQUE KEY uk_ordinary_tag_downside_version (ledger_id,category_id,version)');
    const f = fixture(); await setOrdinaryTagDownsideRule(input);
    expect(f.log.every(sql => !/\b(?:UPDATE|DELETE|ALTER)\b/.test(sql.replace(/FOR UPDATE/g, '')))).toBe(true);
    expect(f.writes().every(sql => !/\b(?:ledger_records|ledger_members|ledger_tag_config|wallet|balance_history)\b/.test(sql))).toBe(true);
  });
});
