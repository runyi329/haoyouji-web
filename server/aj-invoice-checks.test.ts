import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const ai = vi.hoisted(() => ({ getAJInvoiceAIReviewStates: vi.fn(async () => new Map()) }));
vi.mock('./aj-invoice-ai', () => ai);
vi.mock('./db', () => ({ getDbTransactionConnection: vi.fn(() => { throw new Error('禁止真实DB'); }) }));
vi.mock('./encryption', () => ({ decryptValue: (x: string) => x }));
import { getAJPendingInvoiceChecks, assertAJBatchInvoiceChecks, createAJBatchApprovalGuard } from './aj-invoice-checks';
let rows: any[];
let peers: any[];
let conn: any;
let queries: Array<{ sql: string; params: any[] }>;
let network: ReturnType<typeof vi.fn>;
beforeEach(() => {
  rows = [{ id: 10, ledgerId: 70, recordDate: '2026-11-01', amount: '0.30', originalAmount: '0.30', reimbursementAmount: null, createdBy: 4, companyId: 9,
    images: '["https://store.example.com/receipts/a.jpg"]', imageUrl: null, description: '公司办公采购', expenseReason: '办公采购', taxCategory: '办公费', status: 'pending', reimbursementStatus: 'pending', categoryId: 1, type: 'expense', updatedAt: 'stable', employeeName: '甲', companyName: '公司' }];
  peers = [{ ...rows[0] }, { id: 11, amount: '0.30', status: 'approved', employeeName: '乙', companyName: '公司', recordDate: '2026-10-02' }];
  queries = [];
  conn = { execute: vi.fn(async (sql: string, params: any[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('FOR UPDATE')) return [[], []];
    if (sql.includes('AS originalAmount')) return [rows, []];
    if (sql.includes("COALESCE(lr.aj_status,'pending') AS status")) return [peers, []];
    throw new Error(`未stub SQL: ${sql}`);
  }) };
  network = vi.fn(() => { throw new Error('禁止网络'); }); vi.stubGlobal('fetch', network);
});
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const check = (scope = {}, role = 'owner') => getAJPendingInvoiceChecks(conn, { ledgerId: 70, period: 'all', ...scope }, 4, role);
describe('AJ真实金额/日期/权限范围及批审风险指纹', () => {
  it('金额按分精确同额，排除自身，不使用5%容差或浮点差', async () => {
    const result = await check(); expect(result[0].amount).toBe(0.3); expect(result[0].sameAmountCount).toBe(1);
    expect(result[0].sameAmountInvoices.map(x => x.id)).toEqual([11]);
    expect(queries.at(-1)?.params).toContain('0.30'); expect(queries.at(-1)?.sql).toContain("IN ('pending','approved')");
    peers[1].amount = '0.31'; const precise = await check(); expect(precise[0].sameAmountCount).toBe(0);
  });
  it('支持真实闰年日期，拒绝非真实日历日期及金额精度', async () => {
    rows[0].recordDate = '2024-02-29'; let result = await check(); expect(result[0].reviewWarnings.some(x => x.code === 'invalid_date')).toBe(false);
    rows[0].recordDate = '2025-02-29'; result = await check(); expect(result[0].reviewWarnings.some(x => x.code === 'invalid_date')).toBe(true);
    await expect(() => assertAJBatchInvoiceChecks(result, [{ id: 10, fingerprint: result[0].reviewFingerprint }])).toThrow('日期无效');
    rows[0].amount = '1.001'; result = await check(); expect(result[0].reviewWarnings.some(x => x.code === 'invalid_amount')).toBe(true);
  });
  it('scope历史同额查询资方带企业资方授权、worker必须本人及企业归属', async () => {
    await check({}, 'funder'); expect(queries.every(q => q.sql.includes("COALESCE(a.access_type,'worker')='funder'"))).toBe(true);
    queries = []; await check({}, 'worker'); expect(queries.every(q => q.sql.includes('lr.createdBy=?') && q.sql.includes('c.id IS NOT NULL'))).toBe(true);
    expect(queries.every(q => q.params.includes(4))).toBe(true);
  });
  it('期间限定不纳入未来日期且scope不污染同额历史日期筛选', async () => {
    await check({ period: 'month' }); expect(queries[0].sql).toContain('lr.recordDate<=?'); expect(queries.at(-1)?.sql).not.toContain('lr.recordDate<=?');
  });
  it('选定id缺失冲突，不退化为审核全scope', async () => {
    await expect(check({ recordIds: [10, 20] })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('任何风险必须有当前指纹ack，旧fingerprint不通过', async () => {
    const result = await check(); expect(() => assertAJBatchInvoiceChecks(result)).toThrow('风险');
    expect(() => assertAJBatchInvoiceChecks(result, [{ id: 10, fingerprint: result[0].reviewFingerprint }], [{ id: 10, fingerprint: result[0].reviewFingerprint }])).not.toThrow();
    expect(() => assertAJBatchInvoiceChecks(result, [], [{ id: 10, fingerprint: 'a'.repeat(64) }])).toThrow('已变化');
  });
  it('锁内guard先锁风险范围再读，peer pending->approved指纹变化保守拒绝且不误报整批零成功', async () => {
    const original = (await check())[0]; const expected = { id: 10, fingerprint: original.reviewFingerprint };
    peers[1].status = 'pending'; queries = [];
    const guard = createAJBatchApprovalGuard({ ledgerId: 70, period: 'all' }, 4, expected, expected);
    await expect(guard(conn, { id: 10, ledgerId: 70 }, 'owner')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(queries.slice(0, 7).every(q => q.sql.includes('FOR UPDATE'))).toBe(true);
    try { await guard(conn, { id: 10, ledgerId: 70 }, 'owner'); } catch (error: any) { expect(error.message).not.toContain('尚未批准任何申请'); }
    expect(queries.some(q => /^(UPDATE|INSERT)/.test(q.sql))).toBe(false);
  });
});
