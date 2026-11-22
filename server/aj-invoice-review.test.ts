import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ getDbTransactionConnection: vi.fn() }));
vi.mock('./db', () => db);
vi.mock('./encryption', () => ({ decryptValue: (x: string) => x, encryptValue: (x: string) => x, isFieldEncryptionEnabled: vi.fn(async () => false) }));
import { reviewAJInvoice, resubmitAJInvoice, withdrawAJInvoice, editAJInvoice } from './aj-invoice-review';

let row: any;
let conn: any;
let role: string;
let company: any[];
let allowance: boolean;
let cas: number;
let edited: boolean;
let reviewId: number | null;
let queries: Array<{ sql: string; params: any[] }>;
let network: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  row = { id: 10, ledgerId: 70, createdBy: 4, amount: '100.00', reimbursementAmount: null, reimbursementStatus: 'pending', ajCompanyId: 9, ajStatus: 'pending', ajApproveComment: '原理由', recordDate: '2026-11-01' };
  role = 'owner'; company = [{ id: 9, created_by: 4, hasAccess: 1 }]; allowance = false; cas = 1; edited = false; reviewId = 30; queries = [];
  network = vi.fn(() => { throw new Error('禁止真实网络'); }); vi.stubGlobal('fetch', network);
  conn = {
    beginTransaction: vi.fn(async () => {}), commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}), release: vi.fn(),
    execute: vi.fn(async (sql: string, params: any[] = []) => {
      queries.push({ sql, params });
      if (sql.startsWith('SET TRANSACTION')) return [[], []];
      if (sql.includes('SELECT l.type')) return [[{ type: 'custom_aj', role }], []];
      if (sql.includes('SELECT c.id, c.created_by')) return [company, []];
      if (sql.includes('SELECT id, ledgerId, createdBy')) return [[{ ...row }], []];
      if (sql.startsWith('SELECT * FROM ledger_records')) return [[{ ...row, images: null, description: '', recordDate: row.recordDate }], []];
      if (sql.startsWith('SELECT id FROM af_manual_balances')) return [allowance ? [{ id: 1 }] : [], []];
      if (sql.startsWith('SELECT id FROM balance_history')) return [[], []];
      if (sql.includes("field_name='aj_status' AND new_value=?")) return [reviewId ? [{ id: reviewId }] : [], []];
      if (sql.includes("AND action='edit' AND id>?")) return [edited ? [{ id: 40 }] : [], []];
      if (sql.startsWith('UPDATE ledger_records')) return [{ affectedRows: cas }, []];
      if (sql.startsWith('INSERT INTO')) return [{ affectedRows: 1, insertId: 50 }, []];
      throw new Error(`未stub SQL: ${sql}`);
    }),
  };
  db.getDbTransactionConnection.mockResolvedValue(conn);
});
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const approve = (extra = {}) => reviewAJInvoice({ ledgerId: 70, transactionId: 10, userId: 4, status: 'approved', usdCnyRate: 7.2, ...extra });
const writes = () => queries.filter(q => /^(?:UPDATE|INSERT|DELETE)/.test(q.sql));
const rewards = () => queries.filter(q => q.sql.startsWith('INSERT INTO af_manual_balances') || q.sql.startsWith('INSERT INTO balance_history'));

describe('AJ审批独占事务及财务保护（全部离线）', () => {
  it('拒绝必填理由，空白输入在拿DB前拒绝', async () => {
    await expect(reviewAJInvoice({ transactionId: 10, userId: 4, status: 'rejected', comment: '  ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.getDbTransactionConnection).not.toHaveBeenCalled();
  });
  it('拒绝共享fallback连接，不开启事务', async () => {
    const { release, ...shared } = conn; db.getDbTransactionConnection.mockResolvedValue(shared);
    await expect(approve()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });
  it('锁内guard在行锁/授权后且UPDATE前运行，冲突回滚不发津贴', async () => {
    const guard = vi.fn(async (locked: any) => {
      expect(locked).toBe(conn); expect(queries.some(q => q.sql.includes('LIMIT 1 FOR UPDATE'))).toBe(true); expect(writes()).toHaveLength(0);
      throw new Error('peer已变化');
    });
    await expect(approve({ beforeApprove: guard })).rejects.toThrow('peer已变化');
    expect(guard).toHaveBeenCalledOnce(); expect(conn.rollback).toHaveBeenCalledOnce(); expect(conn.commit).not.toHaveBeenCalled(); expect(rewards()).toHaveLength(0);
  });
  it('批准CAS只写一次并日志/津贴同事务', async () => {
    const result = await approve(); expect(result.changed).toBe(true); expect(result.usdtRewarded).toBeCloseTo(0.138889, 6);
    expect(rewards()).toHaveLength(2); expect(conn.commit).toHaveBeenCalledOnce();
    const update = writes().find(q => q.sql.startsWith('UPDATE'))!; expect(update.sql).toContain('aj_status <=> ?'); expect(update.params.at(-1)).toBe('pending');
  });
  it('CAS失败回滚且不写状态日志/津贴', async () => {
    cas = 0; await expect(approve()).rejects.toMatchObject({ code: 'CONFLICT' }); expect(conn.rollback).toHaveBeenCalledOnce(); expect(rewards()).toHaveLength(0);
    expect(writes().filter(q => q.sql.startsWith('INSERT'))).toHaveLength(0);
  });
  it('重复approved幂等，不触发guard/津贴', async () => {
    row.ajStatus = 'approved'; const guard = vi.fn(); const result = await approve({ beforeApprove: guard });
    expect(result.changed).toBe(false); expect(guard).not.toHaveBeenCalled(); expect(writes()).toHaveLength(0);
  });
  it.each(['rejected', 'support_needed'])('批审状态变化%s跳过且不发津贴', async status => {
    row.ajStatus = status; const guard = vi.fn(); const result = await approve({ onlyPending: true, beforeApprove: guard });
    expect(result.changed).toBe(false); expect(guard).not.toHaveBeenCalled(); expect(writes()).toHaveLength(0);
  });
  it.each(['rejected', 'support_needed'])('退回状态%s不可绕过本人重提直接批准', async status => {
    row.ajStatus = status; await expect(approve()).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(writes()).toHaveLength(0);
  });
  it.each(['0', '-1.00', '1.001', 'NaN'])('无效金额%s不可单张批准', async amount => {
    row.reimbursementAmount = amount; await expect(approve()).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(rewards()).toHaveLength(0);
  });
  it.each(['2026-02-30', '2026-1-01', '0000-01-01'])('无效日期%s不可单张批准', async date => {
    row.recordDate = date; await expect(approve()).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(rewards()).toHaveLength(0);
  });
  it.each(['approved', 'completed', 'allowance'])('已有%s财务保护不可普通退回/编辑', async state => {
    if (state === 'approved') row.ajStatus = 'approved'; if (state === 'completed') row.reimbursementStatus = 'completed'; if (state === 'allowance') allowance = true;
    await expect(reviewAJInvoice({ transactionId: 10, userId: 4, status: 'rejected', comment: '说明' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(editAJInvoice(10, 4, { amount: 120 })).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(writes()).toHaveLength(0);
  });
  it('worker不可审批或编辑他人单', async () => {
    role = 'worker'; await expect(approve()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(editAJInvoice(10, 8, { amount: 120 })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(writes()).toHaveLength(0);
  });
  it('资方必须有企业资方授权，企业归属异常管理员也拒绝', async () => {
    role = 'funder'; company = [{ id: 9, created_by: 4, hasAccess: 0 }]; await expect(approve()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    role = 'owner'; company = []; await expect(approve()).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(writes()).toHaveLength(0);
  });
  it('退回重提需本轮真实edit或非空说明，原单编号不变', async () => {
    row.ajStatus = 'rejected'; const input = { ledgerId: 70, transactionId: 10, userId: 4 };
    await expect(resubmitAJInvoice(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    edited = true; const result = await resubmitAJInvoice(input); expect(result.transactionId).toBe(10); expect(result.status).toBe('pending');
    expect(queries.some(q => q.params.includes(30) && q.sql.includes("AND action='edit' AND id>?"))).toBe(true);
    expect(rewards()).toHaveLength(0); expect(writes().some(q => q.sql.startsWith('INSERT INTO ledger_records '))).toBe(false);
  });
  it('无历史日志需明确说明且保留旧拒绝理由', async () => {
    row.ajStatus = 'support_needed'; reviewId = null;
    await expect(resubmitAJInvoice({ ledgerId: 70, transactionId: 10, userId: 4 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await resubmitAJInvoice({ ledgerId: 70, transactionId: 10, userId: 4, comment: '补材料复核' });
    expect(queries.some(q => q.params.some(p => typeof p === 'string' && p.includes('原理由') && p.includes('补材料复核')))).toBe(true);
  });
  it('撤回只能本人pending，非pending拒绝，不发津贴', async () => {
    await expect(withdrawAJInvoice({ ledgerId: 70, transactionId: 10, userId: 8 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    row.ajStatus = 'rejected'; await expect(withdrawAJInvoice({ ledgerId: 70, transactionId: 10, userId: 4 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(rewards()).toHaveLength(0);
  });
});
