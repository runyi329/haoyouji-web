import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
const db = vi.hoisted(() => ({ tx: vi.fn() }));
vi.mock('./db', () => ({ getDbTransactionConnection: db.tx }));
vi.mock('mysql2/promise', () => ({ default: {
  createPool: () => { throw new Error('OFFLINE TEST: real MySQL pool forbidden'); },
  createConnection: () => { throw new Error('OFFLINE TEST: real MySQL connection forbidden'); },
} }));
import { USER_TAG_DOWNSIDE_OVERRIDES_DDL, readUserTagDownsideOverrides,
  readUserTagDownsideCategoryOverrides, setUserTagDownsideOverride, type SetUserTagDownsideOverrideInput } from './user-tag-downside-overrides';

const input: SetUserTagDownsideOverrideInput = {
  ledgerId: 37, categoryId: 10, targetUserId: 20, userId: 7, mode: 'exempt', expectedVersion: 0,
};
const stored = (patch: Record<string, unknown> = {}) => ({ ledger_id: 37, category_id: 10, target_user_id: 20,
  actor_user_id: 7, version: 1, mode: 'exempt', created_at: '2026-11-26T00:00:00.123000Z', ...patch });
const category = { id: 10, ledgerId: 37, parentId: null, isDefault: 0, name: '目标标签', accountingMode: 'manual_balance' };
const target = { id: 800, ledgerId: 37, userId: 20, memberType: 'real', realUserId: 20 };
type FixtureOptions = {
  owner?: number; ownerRows?: any[]; lockedOwner?: number; category?: Record<string, unknown>;
  categoryRows?: any[]; lockedCategory?: Record<string, unknown>; target?: Record<string, unknown>;
  targetRows?: any[]; lockedTarget?: Record<string, unknown>; lockedTargetRows?: any[];
  preRules?: any[]; lockedRules?: any[]; missing?: boolean; preReadError?: unknown; insertError?: unknown;
  affectedRows?: number; commitError?: unknown; beginError?: unknown; rollbackError?: unknown; ddlError?: unknown;
};
function fixture(options: FixtureOptions = {}) {
  const log: string[] = [];
  const connection = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      log.push(sql);
      if (sql.startsWith('SELECT id,ownerId FROM ledgers')) {
        expect(params).toEqual([37]);
        return [options.ownerRows ?? [{ id: 37, ownerId: sql.includes('FOR UPDATE') ? options.lockedOwner ?? options.owner ?? 7 : options.owner ?? 7 }]];
      }
      if (sql.includes('FROM ledger_categories')) {
        expect(params).toEqual([10, 37]);
        return [options.categoryRows ?? [{ ...category, ...options.category, ...(sql.includes('FOR UPDATE') ? options.lockedCategory : {}) }]];
      }
      if (sql.includes('FROM ledger_members')) {
        expect(params).toEqual([37, 20]);
        expect(sql).toContain('INNER JOIN users u ON u.id = m.userId');
        expect(sql).toContain("m.member_type = 'real'");
        if (sql.includes('FOR UPDATE') && options.lockedTargetRows) return [options.lockedTargetRows];
        return [options.targetRows ?? [{ ...target, ...options.target, ...(sql.includes('FOR UPDATE') ? options.lockedTarget : {}) }]];
      }
      if (sql.startsWith('CREATE TABLE')) { if (options.ddlError) throw options.ddlError; return [{ affectedRows: 0 }]; }
      if (sql.includes('FROM ledger_user_tag_downside_overrides')) {
        expect(params).toEqual([37, 20, 10]);
        if (!sql.includes('FOR UPDATE') && options.preReadError) throw options.preReadError;
        if (!sql.includes('FOR UPDATE') && options.missing) throw Object.assign(new Error('missing table'), { errno: 1146 });
        return [sql.includes('FOR UPDATE') ? options.lockedRules ?? (options.preRules?.length ? [options.preRules.reduce((a, b) => Number(a.version) > Number(b.version) ? a : b)] : []) : options.preRules ?? []];
      }
      if (sql.startsWith('INSERT INTO ledger_user_tag_downside_overrides')) {
        expect(params).toHaveLength(7);
        if (options.insertError) throw options.insertError;
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
  return { log, connection, writes: () => log.filter(sql => /^(CREATE|INSERT|UPDATE|DELETE|ALTER)/.test(sql)) };
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
    throw new Error('OFFLINE TEST: all real TCP/network connections forbidden');
  });
  // Resolve the mocked module before concurrency: older Vitest can bypass an in-flight mock factory.
  const mockedDb = await import('./db');
  expect(mockedDb.getDbTransactionConnection).toBe(db.tx);
  vi.stubEnv('PREVIEW_READONLY', 'false'); vi.stubEnv('FAST_PREVIEW', 'false'); vi.stubEnv('DEV_BYPASS_AUTH', 'false');
});
afterEach(() => {
  expect(net.Socket.prototype.connect).not.toHaveBeenCalled();
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe('SELECT-only exact saved-version decoding, all-history without effective dates', () => {
  it('batch reads ledger once, keeps all users/categories/versions with no DDL, cache or cutoff', async () => {
    const conn = { execute: vi.fn(async () => [[stored({ version: '1', mode: 'follow_tag' }),
      stored({ version: 2, created_at: '9999-12-31T00:00:00.000000Z' }), stored({ target_user_id: 21 }), stored({ category_id: 11 })]]) };
    const result = await readUserTagDownsideOverrides(conn, 37);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ ledgerId: 37, categoryId: 10, targetUserId: 20, actorUserId: 7,
      version: 1, mode: 'follow_tag', createdAt: '2026-11-26T00:00:00.123000Z' });
    expect(result[1].version).toBe(2);
    expect(result.every(row => !('effectiveAt' in row) && !('startDate' in row))).toBe(true);
    expect(conn.execute).toHaveBeenCalledOnce();
    expect(conn.execute.mock.calls[0]).toEqual([expect.stringContaining('WHERE ledger_id=? ORDER BY'), [37]]);
    const sql = (conn.execute.mock.calls as any)[0][0];
    expect(sql).not.toMatch(/start_date|effective_at|CURRENT_DATE|NOW\(|created_at\s*[<>]|LIMIT/i);
    await readUserTagDownsideOverrides(conn, 37);
    expect(conn.execute).toHaveBeenCalledTimes(2); expect(db.tx).not.toHaveBeenCalled();
  });
  it('target and exact category reads bind scope and query only once each', async () => {
    const conn = { execute: vi.fn(async (_sql: string, _params: unknown[]) => [[stored()]]) };
    expect(await readUserTagDownsideOverrides(conn, 37, 20)).toHaveLength(1);
    expect(conn.execute.mock.calls[0]).toEqual([expect.stringContaining('WHERE ledger_id=? AND target_user_id=?'), [37, 20]]);
    expect(await readUserTagDownsideCategoryOverrides(conn, 37, 20, 10)).toHaveLength(1);
    expect(conn.execute.mock.calls[1]).toEqual([expect.stringContaining('WHERE ledger_id=? AND target_user_id=? AND category_id=?'), [37, 20, 10]]);
    expect(conn.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  it.each([{ code: 'ER_NO_SUCH_TABLE' }, { errno: 1146 }])('only missing table compat returns [] without DDL/cache %j', async patch => {
    const conn = { execute: vi.fn(async (_sql: string, _params: unknown[]) => { throw Object.assign(new Error('missing'), patch); }) };
    expect(await readUserTagDownsideOverrides(conn, 37)).toEqual([]);
    expect(await readUserTagDownsideOverrides(conn, 37, 20)).toEqual([]);
    expect(await readUserTagDownsideCategoryOverrides(conn, 37, 20, 10)).toEqual([]);
    expect(conn.execute).toHaveBeenCalledTimes(3);
    expect(conn.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  it.each([new Error('timeout'), Object.assign(new Error('access denied'), { errno: 1142 }),
    Object.assign(new Error('network fault'), { code: 'ECONNRESET' })])('other DB failures propagate, never fake raw', async error => {
    const conn = { execute: vi.fn(async () => { throw error; }) };
    await expect(readUserTagDownsideOverrides(conn, 37)).rejects.toBe(error);
  });
  it.each([
    { ledger_id: 38 }, { category_id: 0 }, { category_id: '' }, { category_id: '10abc' }, { category_id: '1e1' },
    { target_user_id: null }, { target_user_id: 1.5 }, { actor_user_id: 0 }, { actor_user_id: true },
    { version: Number.MAX_SAFE_INTEGER + 1 }, { version: 'Infinity' }, { version: -1 }, { version: null },
    { mode: 'normal' }, { mode: null }, { mode: 'EXEMPT' },
    { created_at: '2026-02-30T00:00:00.000000Z' }, { created_at: '2026-11-26T24:00:00.000000Z' },
    { created_at: '2026-11-26T00:00:00+08:00' }, { created_at: '2026-11-26 00:00:00' }, { created_at: null },
  ])('corrupt saved numeric/mode/date/scope is fail-closed %j', async patch => {
    const conn = { execute: vi.fn(async () => [[stored(patch)]]) };
    await expect(readUserTagDownsideOverrides(conn, 37)).rejects.toThrow();
  });
  it('wrong target/category scope and duplicate revisions throw rather than choose raw', async () => {
    await expect(readUserTagDownsideOverrides({ execute: vi.fn(async () => [[stored({ target_user_id: 21 })]]) }, 37, 20)).rejects.toThrow('范围');
    await expect(readUserTagDownsideCategoryOverrides({ execute: vi.fn(async () => [[stored({ category_id: 11 })]]) }, 37, 20, 10)).rejects.toThrow('范围');
    await expect(readUserTagDownsideOverrides({ execute: vi.fn(async () => [[stored(), stored({ mode: 'follow_tag' })]]) }, 37)).rejects.toThrow('重复版本');
    await expect(readUserTagDownsideOverrides({ execute: vi.fn(async () => [{ affectedRows: 0 }]) }, 37)).rejects.toThrow('读取结果');
  });
  it('invalid query scope rejects with zero SQL, no wrong-ledger fallback', async () => {
    const conn = { execute: vi.fn() };
    await expect(readUserTagDownsideOverrides(conn, 38)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(readUserTagDownsideOverrides(conn, 37, 0)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(readUserTagDownsideCategoryOverrides(conn, 37, 20, NaN)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(conn.execute).not.toHaveBeenCalled();
  });
});

describe('zero-SQL save guards, actual owner first-read authority, legal real targets', () => {
  it.each(['PREVIEW_READONLY', 'FAST_PREVIEW', 'DEV_BYPASS_AUTH'])('%s is forbidden before connection/SQL', async flag => {
    const f = fixture(); vi.stubEnv(flag, 'true');
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.tx).not.toHaveBeenCalled(); expect(f.connection.execute).not.toHaveBeenCalled();
  });
  it('viewAs cannot save even actual owner or system admin, zero connection/SQL', async () => {
    const f = fixture();
    await expect(setUserTagDownsideOverride({ ...input, isViewingAs: true, systemRole: 'super_admin' })).rejects.toThrow('代看');
    expect(db.tx).not.toHaveBeenCalled(); expect(f.connection.execute).not.toHaveBeenCalled();
  });
  it.each([
    { ledgerId: 38 }, { ledgerId: '37' }, { categoryId: 0 }, { categoryId: 1.5 }, { categoryId: null },
    { targetUserId: -1 }, { targetUserId: '20' }, { targetUserId: NaN }, { userId: 0 }, { userId: true },
    { mode: 'normal' }, { mode: 'EXEMPT' }, { mode: undefined }, { expectedVersion: -1 }, { expectedVersion: 1.5 },
    { expectedVersion: '0' }, { expectedVersion: Number.MAX_SAFE_INTEGER }, { expectedVersion: Infinity },
    { systemRole: 1 }, { isViewingAs: 0 }, { startDate: '2026-01-01' }, { effectiveAt: '2026-01-01' },
    { actorUserId: 7 }, { viewAsUserId: 20 }, { bypassOwner: true },
  ])('strict invalid input rejects before DB %j', async patch => {
    const f = fixture();
    await expect(setUserTagDownsideOverride({ ...input, ...patch } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.tx).not.toHaveBeenCalled(); expect(f.log).toEqual([]);
  });
  it('pseudo actor/viewAs fields rejected even undefined, inherited or non-enumerable, zero SQL', async () => {
    for (const key of ['actorUserId', 'viewAsUserId']) {
      const f = fixture();
      for (const value of [
        { ...input, [key]: undefined },
        Object.assign(Object.create({ [key]: 999 }), input),
        Object.defineProperty({ ...input }, key, { value: 999, enumerable: false }),
      ]) {
        await expect(setUserTagDownsideOverride(value)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      }
      expect(db.tx).not.toHaveBeenCalled(); expect(f.connection.execute).not.toHaveBeenCalled();
    }
  });
  it.each(['admin', 'super_admin', 'systemadmin', 'owner'])('systemRole %s never authorizes nonowner, first read only', async systemRole => {
    const f = fixture({ owner: 8 });
    await expect(setUserTagDownsideOverride({ ...input, systemRole })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.connection.execute).toHaveBeenCalledOnce(); expect(f.log[0]).toMatch(/^SELECT id,ownerId FROM ledgers/);
    expect(f.writes()).toEqual([]); expect(f.connection.beginTransaction).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it.each([{ ownerRows: [] }, { ownerRows: [{ id: 38, ownerId: 7 }] },
    { ownerRows: [{ id: 37, ownerId: 7 }, { id: 37, ownerId: 7 }] }])('missing/malformed owner rows reject %j', async ({ ownerRows }) => {
    const f = fixture({ ownerRows });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.writes()).toEqual([]);
  });
  it.each([{ id: 11 }, { ledgerId: 38 }, { parentId: 1 }, { parentId: 0 }, { isDefault: 1 },
    { isDefault: null }, { accountingMode: 'ordinary' }, { accountingMode: null }, { name: '' }, { name: '  ' }])('illegal category before DDL %j', async patch => {
    const f = fixture({ category: patch });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.writes()).toEqual([]); expect(f.connection.beginTransaction).not.toHaveBeenCalled();
  });
  it('missing and ambiguous categories are forbidden before DDL', async () => {
    for (const categoryRows of [[], [category, category]]) {
      const f = fixture({ categoryRows });
      await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(f.writes()).toEqual([]);
    }
  });
  it.each([{ ledgerId: 38 }, { userId: 21 }, { realUserId: 21 }, { realUserId: null }, { memberType: 'ai' },
    { memberType: undefined }, { id: 0 }])('wrong-ledger/AI/fake/mismatched target rejects before DDL %j', async patch => {
    const f = fixture({ target: patch });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.writes()).toEqual([]); expect(f.log).toHaveLength(4); // three SELECTs then release
  });
  it('missing or duplicate real membership rejects before version read or DDL', async () => {
    for (const targetRows of [[], [target, target]]) {
      const f = fixture({ targetRows });
      await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(f.log.some(sql => sql.includes('FROM ledger_user_tag_downside_overrides'))).toBe(false); expect(f.writes()).toEqual([]);
    }
  });
});

describe('append-only explicit saves, preflight + locked CAS, ledger-first locks and safe cleanup', () => {
  it.each(['manual_balance', 'stock_portfolio'])('allows actual owner for legal %s category, DDL only after all checks', async accountingMode => {
    const f = fixture({ category: { accountingMode }, missing: true });
    const result = await setUserTagDownsideOverride({ ...input, systemRole: 'member' });
    expect(result).toMatchObject({ success: true, override: { ledgerId: 37, categoryId: 10, targetUserId: 20,
      actorUserId: 7, version: 1, mode: 'exempt' } });
    expect(Object.keys(result.override).sort()).toEqual(['ledgerId', 'categoryId', 'targetUserId', 'actorUserId', 'version', 'mode', 'createdAt'].sort());
    expect(result.override.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/);
    expect(db.tx).toHaveBeenCalledOnce();
    expect(f.log[0]).toContain('FROM ledgers'); expect(f.log[1]).toContain('FROM ledger_categories');
    expect(f.log[2]).toContain('FROM ledger_members'); expect(f.log[3]).toContain('FROM ledger_user_tag_downside_overrides');
    expect(f.log[4]).toBe(USER_TAG_DOWNSIDE_OVERRIDES_DDL); expect(f.log[5]).toBe('BEGIN');
    const locks = f.log.filter(sql => sql.includes('FOR UPDATE'));
    expect(locks).toHaveLength(4); expect(locks[0]).toContain('FROM ledgers');
    expect(locks[1]).toContain('FROM ledger_categories'); expect(locks[2]).toContain('FROM ledger_members');
    expect(locks[3]).toContain('FROM ledger_user_tag_downside_overrides');
    expect(locks[3]).toContain('ORDER BY version DESC LIMIT 1 FOR UPDATE');
    expect(f.writes()).toHaveLength(2); expect(f.log.slice(-2)).toEqual(['COMMIT', 'RELEASE']);
    expect(f.connection.rollback).not.toHaveBeenCalled();
  });
  it('explicit follow_tag appends next revision, CAS uses max ALL saved versions, no dates', async () => {
    const f = fixture({ preRules: [stored({ version: 2 }), stored({ version: 1 })] });
    const result = await setUserTagDownsideOverride({ ...input, expectedVersion: 2, mode: 'follow_tag' });
    expect(result.override.version).toBe(3); expect(result.override.mode).toBe('follow_tag');
    const call = f.connection.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT'));
    expect(call?.[1]?.slice(0, 6)).toEqual([37, 10, 20, 7, 3, 'follow_tag']);
    expect(call?.[1]?.[6]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(f.log.join('\n')).not.toMatch(/start_date|effective_at|UPDATE ledger_|DELETE FROM/);
  });
  it('preflight CAS conflict prevents DDL, including missing table when expectedVersion is nonzero', async () => {
    for (const options of [{ preRules: [stored()] }, { missing: true }]) {
      const f = fixture(options);
      await expect(setUserTagDownsideOverride({ ...input, expectedVersion: options.missing ? 1 : 0 })).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(f.writes()).toEqual([]); expect(f.connection.beginTransaction).not.toHaveBeenCalled();
      expect(f.connection.release).toHaveBeenCalledOnce();
    }
  });
  it('preflight DB fault/corrupt row/scope/duplicate blocks DDL instead of resetting version', async () => {
    for (const options of [{ preReadError: new Error('read timeout') }, { preRules: [stored({ mode: 'bad' })] },
      { preRules: [stored({ target_user_id: 21 })] }, { preRules: [stored(), stored()] }]) {
      const f = fixture(options);
      await expect(setUserTagDownsideOverride(input)).rejects.toThrow();
      expect(f.writes()).toEqual([]); expect(f.connection.release).toHaveBeenCalledOnce();
    }
  });
  it('locked CAS sees concurrent new version and rolls back without INSERT', async () => {
    const f = fixture({ lockedRules: [stored()] });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.writes()).toEqual([USER_TAG_DOWNSIDE_OVERRIDES_DDL]);
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.log.slice(-2)).toEqual(['ROLLBACK', 'RELEASE']);
  });
  it.each([{ ledger_id: 38 }, { category_id: 11 }, { target_user_id: 21 }, { version: null },
    { mode: 'raw' }, { created_at: 'bad time' }])('locked corrupt/scope row cannot append %j', async patch => {
    const f = fixture({ lockedRules: [stored(patch)] });
    await expect(setUserTagDownsideOverride(input)).rejects.toThrow();
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.writes()).toHaveLength(1);
  });
  it('multiple locked latest rows fail closed rather than selecting arbitrary exempt', async () => {
    const f = fixture({ lockedRules: [stored(), stored()] });
    await expect(setUserTagDownsideOverride(input)).rejects.toThrow('版本结果');
    expect(f.connection.rollback).toHaveBeenCalledOnce();
  });
  it('owner changed under FIRST lock is rejected before category/target lock', async () => {
    const f = fixture({ lockedOwner: 8 });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.log.filter(sql => sql.includes('FOR UPDATE'))).toHaveLength(1);
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.writes()).toHaveLength(1);
  });
  it.each([{ parentId: 1 }, { isDefault: 1 }, { ledgerId: 38 }, { accountingMode: 'bad' }])('category changed under lock rolls back %j', async lockedCategory => {
    const f = fixture({ lockedCategory });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.writes()).toHaveLength(1);
  });
  it.each([{ memberType: 'ai' }, { ledgerId: 38 }, { realUserId: 21 }, { userId: 21 }])('target changed under lock rolls back %j', async lockedTarget => {
    const f = fixture({ lockedTarget });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.writes()).toHaveLength(1);
  });
  it('target membership removed before lock rolls back and never inserts', async () => {
    const f = fixture({ lockedTargetRows: [] });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.writes()).toHaveLength(1);
  });
  it.each([{ code: 'ER_DUP_ENTRY' }, { errno: 1062 }])('concurrent unique collision returns conflict with rollback/release %j', async patch => {
    const f = fixture({ insertError: Object.assign(new Error('duplicate append'), patch) });
    await expect(setUserTagDownsideOverride(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.release).toHaveBeenCalledOnce();
    expect(f.connection.commit).not.toHaveBeenCalled();
  });
  it('two concurrent explicit saves on exclusive mocked connections: unique loser never succeeds', async () => {
    const first = fixture(); const second = fixture({ insertError: Object.assign(new Error('unique concurrent loser'), { errno: 1062 }) });
    let enterFirst!: () => void, releaseFirst!: () => void;
    const entered = new Promise<void>(resolve => { enterFirst = resolve; });
    const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const executeFirst = first.connection.execute.getMockImplementation()!;
    first.connection.execute.mockImplementation(async (sql, params) => {
      if (sql.startsWith('SELECT id,ownerId FROM ledgers') && !sql.includes('FOR UPDATE')) {
        enterFirst(); await gate;
      }
      return executeFirst(sql, params);
    });
    db.tx.mockReset(); db.tx.mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection);
    const saveFirst = setUserTagDownsideOverride(input);
    await entered; // First mock import completed, but its exclusive transaction remains in flight.
    const saveSecond = setUserTagDownsideOverride(input);
    releaseFirst();
    const results = await Promise.allSettled([saveFirst, saveSecond]);
    expect(results[0].status).toBe('fulfilled'); expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'CONFLICT' } });
    expect(db.tx).toHaveBeenCalledTimes(2);
    expect(first.connection.commit).toHaveBeenCalledOnce(); expect(second.connection.rollback).toHaveBeenCalledOnce();
    expect(first.connection.release).toHaveBeenCalledOnce(); expect(second.connection.release).toHaveBeenCalledOnce();
  });
  it.each([{ affectedRows: 0 }, { affectedRows: 2 }, { insertError: new Error('insert fault') },
    { commitError: new Error('commit fault') }])('insert/commit fault no success, rollback/release %j', async options => {
    const f = fixture(options);
    await expect(setUserTagDownsideOverride(input)).rejects.toThrow();
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it.each([{ ddlError: new Error('DDL fault') }, { beginError: new Error('BEGIN fault') }])('DDL/begin fault releases, never falsely commits %j', async options => {
    const f = fixture(options);
    await expect(setUserTagDownsideOverride(input)).rejects.toThrow();
    expect(f.connection.release).toHaveBeenCalledOnce(); expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.connection.rollback).not.toHaveBeenCalled();
  });
  it('rollback failure preserves BOTH failures and still releases', async () => {
    const insertError = new Error('insert fault'), rollbackError = new Error('rollback fault');
    const f = fixture({ insertError, rollbackError });
    const error = await setUserTagDownsideOverride(input).catch(error => error);
    expect(error).toBeInstanceOf(AggregateError); expect(error.errors).toEqual([insertError, rollbackError]);
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it('absent exclusive connection and acquire fault fail closed', async () => {
    db.tx.mockResolvedValue(null);
    await expect(setUserTagDownsideOverride(input)).rejects.toThrow('独占事务连接');
    db.tx.mockRejectedValue(new Error('acquire fault'));
    await expect(setUserTagDownsideOverride(input)).rejects.toThrow('acquire fault');
  });
  it('fallback end() disposes dedicated connection when release is absent', async () => {
    const f = fixture(); const end = vi.fn(async () => undefined);
    db.tx.mockResolvedValue({ ...f.connection, release: undefined, end });
    await setUserTagDownsideOverride(input); expect(end).toHaveBeenCalledOnce();
  });
  it('DDL unique scope and SQL only insert into separate table, never principal/permission/member JSON', async () => {
    expect(USER_TAG_DOWNSIDE_OVERRIDES_DDL).toContain('UNIQUE KEY uk_user_tag_downside_version (ledger_id,category_id,target_user_id,version)');
    expect(USER_TAG_DOWNSIDE_OVERRIDES_DDL).not.toMatch(/start_date|effective_at/i);
    expect(USER_TAG_DOWNSIDE_OVERRIDES_DDL).toContain("mode ENUM('follow_tag','exempt') NOT NULL");
    const f = fixture(); await setUserTagDownsideOverride(input);
    expect(f.writes().every(sql => /^(CREATE TABLE IF NOT EXISTS|INSERT INTO) ledger_user_tag_downside_overrides/.test(sql))).toBe(true);
    expect(f.writes().join('\n')).not.toMatch(/ledger_records|ledger_members|initial_balances|wallet|settlement|quote|permission/i);
    expect(f.log.every(sql => !/\b(?:UPDATE|DELETE|ALTER)\b/.test(sql.replace(/FOR UPDATE/g, '')))).toBe(true);
  });
});
