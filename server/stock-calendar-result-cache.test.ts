import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStockTotalCalendar } from './shared/stock-total-calendar';

const db = vi.hoisted(() => ({ conn: null as any }));
vi.mock('./db', () => ({ getDbConnection: async () => db.conn, getDbTransactionConnection: async () => db.conn }));

function makeDb() {
  let row: any = null;
  const sql: string[] = [];
  const conn = {
    sql,
    get row() { return row; },
    set row(value: any) { row = value; },
    beginTransaction: vi.fn(async () => {}), commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}), release: vi.fn(),
    execute: vi.fn(async (query: string, params: any[] = []) => {
      sql.push(query);
      if (query.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (query.startsWith('CREATE') || query.startsWith('SET') || query.includes('RELEASE_LOCK')) return [[]];
      if (query.startsWith('INSERT IGNORE')) {
        row ??= { generation: '0', computed_generation: null, revision: '0', computed_at: null, settlement_version: null };
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith('INSERT INTO')) {
        row ??= { generation: '0', computed_generation: null, revision: '0', computed_at: null, settlement_version: null };
        row.generation = String(Number(row.generation) + 1);
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith('SELECT')) return [[...(row ? [{ ...row }] : [])]];
      if (query.startsWith('UPDATE')) {
        if (String(params.at(-1)) !== row.generation) return [{ affectedRows: 0 }];
        Object.assign(row, { computed_generation: params[0], revision: String(Number(row.revision) + 1),
          settlement_version: params[1], latest_settlement_date: params[2], computed_at: params[3], payload: params[4], payload_encoding: 'gzip-base64' });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL ${query}`);
    }),
  };
  return conn;
}
const now = new Date('2026-11-10T15:05:00+08:00');
function payload() {
  return buildStockTotalCalendar({ lots: [{ id: 1, symbol: '600000.SH', initialQuantity: 100, unitCost: 10,
    openingFee: null, openedDate: '2026-11-06' }], sales: [], quotes: [
    { symbol: '600000.SH', price: 11, priceDate: '2026-11-06', source: 'unified_close_yahoo', capturedAt: '2026-11-06T15:05:00+08:00' },
  ], fx: [], now }).reverse();
}

beforeEach(() => { vi.resetModules(); db.conn = makeDb(); });

describe('stock calendar derived cache (offline only)', () => {
  it('gzip roundtrip retains every ready/unready/null row and full provenance', async () => {
    const { encodeStockCalendarResult, decodeStockCalendarResult } = await import('./stock-calendar-result-cache');
    const rows = payload();
    expect(rows.some(row => row.ready)).toBe(true);
    expect(rows.some(row => !row.ready && row.totalPnl === null)).toBe(true);
    expect(decodeStockCalendarResult(encodeStockCalendarResult(rows))).toEqual(rows);
    expect(decodeStockCalendarResult(JSON.stringify(rows), 'json')).toEqual(rows);
    expect(() => decodeStockCalendarResult('[]', 'invalid')).toThrow();
  });

  it('missing result/table is [], with only SELECT and no calculate or schema writes', async () => {
    const cache = await import('./stock-calendar-result-cache');
    expect(await cache.readStockCalendarResult(8)).toEqual([]);
    expect(db.conn.sql.every((query: string) => query.startsWith('SELECT'))).toBe(true);
    db.conn.execute.mockRejectedValueOnce({ code: 'ER_NO_SUCH_TABLE' });
    expect(await cache.readStockCalendarResult(8)).toEqual([]);
  });

  it('hot reads check current persisted revision every time, avoid re-reading payload and retain old when dirty', async () => {
    const cache = await import('./stock-calendar-result-cache');
    const calculate = vi.fn(async () => payload());
    expect(await cache.rebuildCachedStockCalendarResult({ categoryId: 8, now, calculate })).toMatchObject({ saved: true, status: 'saved' });
    db.conn.sql.length = 0;
    const first = await cache.readStockCalendarResult(8);
    await cache.markStockCalendarResultDirty(db.conn, 8);
    const second = await cache.readStockCalendarResult(8);
    expect(second).toBe(first);
    expect(db.conn.sql.filter((query: string) => query.startsWith('SELECT'))).toHaveLength(2);
    expect(db.conn.sql.filter((query: string) => query.startsWith('SELECT')).every((query: string) => !query.includes(',payload,'))).toBe(true);
    expect(calculate).toHaveBeenCalledTimes(1);
    const updated = payload().map(row => ({ ...row, fxSource: 'changed-proof' }));
    db.conn.row.payload = cache.encodeStockCalendarResult(updated); db.conn.row.revision = '2';
    expect(await cache.readStockCalendarResult(8)).toEqual(updated);
  });

  it('singleflight merges concurrent rebuild and clean repeated warm never computes full history', async () => {
    const cache = await import('./stock-calendar-result-cache');
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const calculate = vi.fn(async () => { await hold; return payload(); });
    const a = cache.rebuildCachedStockCalendarResult({ categoryId: 8, now, calculate });
    const b = cache.rebuildCachedStockCalendarResult({ categoryId: 8, now, calculate });
    expect(a).toBe(b); release(); await a;
    expect(await cache.rebuildCachedStockCalendarResult({ categoryId: 8, now, calculate })).toMatchObject({ status: 'up-to-date' });
    expect(calculate).toHaveBeenCalledTimes(1);
    await cache.rebuildCachedStockCalendarResult({ categoryId: 8, now, calculate, force: true });
    expect(calculate).toHaveBeenCalledTimes(2);
  });

  it('a successful trade generation races old calculation: CAS rejects old and recomputes before save', async () => {
    const cache = await import('./stock-calendar-result-cache');
    const old = payload(); const fresh = old.map(row => ({ ...row, fxSource: 'new-source' }));
    const calculate = vi.fn(async () => {
      if (calculate.mock.calls.length === 1) { await cache.markStockCalendarResultDirty(db.conn, 8); return old; }
      return fresh;
    });
    expect(await cache.rebuildCachedStockCalendarResult({ categoryId: 8, now, calculate })).toMatchObject({ status: 'saved', revision: '1' });
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(await cache.readStockCalendarResult(8)).toEqual(fresh);
  });

  it('future 15:05 does not clear older calendar, and failed rebuild preserves saved payload', async () => {
    const cache = await import('./stock-calendar-result-cache');
    await cache.rebuildCachedStockCalendarResult({ categoryId: 8, now, calculate: async () => payload() });
    const before = db.conn.row.payload;
    const next = new Date('2026-11-11T15:05:00+08:00');
    expect(cache.isStockCalendarResultCurrent(db.conn.row, 'cn-day-us-overnight-1505-v1:2026-11-11')).toBe(false);
    await expect(cache.rebuildCachedStockCalendarResult({ categoryId: 8, now: next,
      calculate: async () => { throw new Error('invalid history'); } })).rejects.toThrow('invalid history');
    expect(db.conn.row.payload).toBe(before);
    expect(await cache.readStockCalendarResult(8)).toEqual(payload());
    expect(db.conn.rollback).toHaveBeenCalled(); expect(db.conn.release).toHaveBeenCalled();
  });
});
