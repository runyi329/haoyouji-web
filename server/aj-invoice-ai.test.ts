import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const db = vi.hoisted(() => ({ getDbConnection: vi.fn(), getDbTransactionConnection: vi.fn() }));
vi.mock('./db', () => db);
vi.mock('./_core/env', () => ({ ENV: { forgeApiKey: '', forgeApiUrl: '' } }));
vi.mock('./encryption', () => ({ decryptValue: (x: string) => x }));
import { getAJInvoiceAIResult, analyzeAJInvoice, confirmAJInvoiceClassification, validateAJExpenseConfig } from './aj-invoice-ai';
import * as vision from './aj-invoice-vision';
const hash = (x: any) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
let rows: any[];
let logs: any[];
let role: string;
let config: any;
let queries: Array<{ sql: string; params: any[] }>;
let network: ReturnType<typeof vi.fn>;
let conn: any;
beforeEach(() => {
  vi.clearAllMocks(); role = 'owner'; config = { office: { enabled: true, items: { supplies: true }, accountingMap: { supplies: '管理费用-办公费' } } };
  rows = [{ id: 10, ledgerId: 70, createdBy: 4, amount: '100.00', reimbursement_amount: null, reimbursement_status: 'pending', aj_company_id: 9, aj_status: 'pending', recordDate: '2026-11-01', type: 'expense', categoryId: 1,
    images: '["https://store.example.com/receipts/a.jpg"]', imageUrl: null, description: '公司办公用品采购', aj_expense_reason: '', aj_tax_category: null, aj_accounting_code: null, updatedAt: 'same', companyName: '甲公司', hasAllowance: 0 }];
  logs = []; queries = []; vi.stubEnv('AJ_INVOICE_IMAGE_ALLOWED_PREFIXES', 'https://store.example.com/receipts/');
  network = vi.fn(() => { throw new Error('禁止真实网络/AI'); }); vi.stubGlobal('fetch', network);
  conn = { beginTransaction: vi.fn(async () => {}), commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}), release: vi.fn(), execute: vi.fn(async (sql: string, params: any[] = []) => {
    queries.push({ sql, params });
    if (sql.startsWith('SET TRANSACTION') || sql.startsWith('SELECT id FROM ledger_members') || sql.startsWith('SELECT company_id FROM aj_company_access')) return [[], []];
    if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }], []];
    if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }], []];
    if (sql.includes('SELECT l.type')) return [[{ type: 'custom_aj', role }], []];
    if (sql.includes('SELECT c.id, c.created_by')) return [[{ id: 9, created_by: 4, hasAccess: 1 }], []];
    if (sql.startsWith('SELECT * FROM ledger_records')) return [[rows[0]], []];
    if (sql.includes('SELECT lm.role, lm.permission_view')) {
      expect(sql).toContain('lm.permission_edit AS permissionEdit');
      expect(sql).not.toMatch(/lm\.permission(View|Edit)\b/);
      return [[{ role, permissionView: 'all', permissionEdit: 'own' }], []];
    }
    if (sql.startsWith('SELECT lr.*, c.name')) return [rows, []];
    if (sql.startsWith('SELECT l.id, l.record_id')) return [logs, []];
    if (sql.startsWith('SELECT id, name, tax_no')) return [[{ id: 9, name: '甲公司', tax_no: '00123AB' }], []];
    if (sql.startsWith('SELECT company_id, config, updated_at')) return [[{ company_id: 9, config: JSON.stringify(config), updated_at: 1 }], []];
    if (sql.startsWith('SELECT id FROM af_manual_balances') || sql.startsWith('SELECT id FROM balance_history')) return [[], []];
    throw new Error(`未stub SQL: ${sql}`);
  }) };
  db.getDbConnection.mockResolvedValue(conn); db.getDbTransactionConnection.mockResolvedValue(conn);
});
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const identity = { ledgerId: 70, recordId: 10, userId: 4 };
async function installAnalysis(patch: any = {}, record = rows[0]) {
  const state = await getAJInvoiceAIResult(identity);
  const invoice = { invoiceNumber: '0000123', invoiceCode: '0001', buyerName: '甲公司', buyerTaxNo: '00123AB', sellerName: '乙商店', sellerTaxNo: '00999CD', totalAmount: '100.00', invoiceDate: '2026-11-01', items: ['办公用品'], confidence: 0.99, uncertainFields: [] };
  const analysis = { extraction: { invoices: [invoice], notes: [] }, candidates: [{ categoryKey: 'office', itemKey: 'supplies', confidence: 0.99, reason: '实际办公用途明确' }], purposeClear: true, mixedItems: false, reason: '公司采购',
    version: 1, imageKey: hash({ images: record.images ?? null, imageUrl: record.imageUrl ?? null }), snapshotKey: state.snapshotKey, analyzedAt: '2026-11-01T00:00:00.000Z', model: 'offline-fixture', company: state.company, purpose: { description: record.description, expenseReason: '' }, ...patch };
  logs.push({ id: 50 + logs.length, record_id: record.id, field_name: 'aj_ai_analysis', new_value: JSON.stringify(analysis), created_at: '2026-11-01' }); return analysis;
}
const codes = (state: any) => state.checks.map((x: any) => x.code);
describe('AJ AI query/缓存/买方/目录离线真实状态计算', () => {
  it('查询只读：不建表/不写日志/不调用AI；默认categoryId不代表人工', async () => {
    const state = await getAJInvoiceAIResult(identity); expect(state.state).toBe('not_analyzed'); expect(state.manualLocked).toBe(false); expect(state.source).toBe('none');
    expect(queries.every(q => q.sql.startsWith('SELECT'))).toBe(true); expect(db.getDbTransactionConnection).not.toHaveBeenCalled();
  });
  it('缓存ready识别按钮无AI/事务调用，号码与税号保留前导零字符串', async () => {
    await installAnalysis(); const state = await analyzeAJInvoice(identity); expect(state.state).toBe('ready');
    expect(state.extraction?.invoices[0].invoiceNumber).toBe('0000123'); expect(state.extraction?.invoices[0].buyerTaxNo).toBe('00123AB'); expect(db.getDbTransactionConnection).not.toHaveBeenCalled();
  });
  it('核对买方不是销售方，买方税号按字符串精确规范化', async () => {
    const a = await installAnalysis(); a.extraction.invoices[0].buyerName = '乙商店'; a.extraction.invoices[0].buyerTaxNo = '123AB'; a.extraction.invoices[0].sellerName = '甲公司'; a.extraction.invoices[0].sellerTaxNo = '00123AB'; logs[0].new_value = JSON.stringify(a);
    const state = await getAJInvoiceAIResult(identity); expect(codes(state)).toContain('buyer_mismatch'); expect(codes(state)).toContain('buyer_tax_no_mismatch'); expect(state.classification.status).not.toBe('auto');
  });
  it('金额按分无容差，0.01差异也告警，非法日历日期阻止auto', async () => {
    const a = await installAnalysis(); a.extraction.invoices[0].totalAmount = '100.01'; a.extraction.invoices[0].invoiceDate = '2026-02-30'; logs[0].new_value = JSON.stringify(a);
    const state = await getAJInvoiceAIResult(identity); expect(codes(state)).toContain('amount_mismatch'); expect(codes(state)).toContain('invoice_date_unknown');
  });
  it.each(['description', 'amount', 'recordDate', 'images'])('输入%s变化缓存stale，不应用旧建议', async field => {
    await installAnalysis(); rows[0][field] = field === 'amount' ? '101.00' : field === 'recordDate' ? '2026-11-02' : field === 'images' ? '["https://store.example.com/receipts/b.jpg"]' : '不同用途';
    const state = await getAJInvoiceAIResult(identity); expect(state.state).toBe('stale'); expect(state.canApply).toBe(false);
    if (field === 'images') expect(state.extraction).toBeNull();
  });
  it('人工/legacy锁不覆盖；存在真实分类编辑日志才视为人工', async () => {
    await installAnalysis(); rows[0].aj_tax_category = '旧人工分类'; let state = await getAJInvoiceAIResult(identity); expect(state.source).toBe('legacy_manual'); expect(state.manualLocked).toBe(true);
    rows[0].aj_tax_category = null; logs.push({ id: 90, record_id: 10, field_name: '分类', new_value: '办公费' }); state = await getAJInvoiceAIResult(identity); expect(state.manualLocked).toBe(true);
  });
  it('明确manual锁及上下文变化仍保留锁', async () => {
    await installAnalysis(); const state = await getAJInvoiceAIResult(identity);
    logs.push({ id: 90, record_id: 10, field_name: 'aj_classification', new_value: JSON.stringify({ version: 1, source: 'manual', manualLocked: true, contextSnapshot: state.snapshotKey, analysisId: 50, categoryId: 1, current: state.current }) });
    rows[0].description = '改变用途'; const latest = await getAJInvoiceAIResult(identity); expect(latest.manualLocked).toBe(true); expect(codes(latest)).toContain('classification_context_stale');
  });
  it('缓存数字票号不符合schema，损坏缓存不回退不auto', async () => {
    const a = await installAnalysis(); (a.extraction.invoices[0] as any).invoiceNumber = 123; logs[0].new_value = JSON.stringify(a);
    const state = await getAJInvoiceAIResult(identity); expect(state.state).toBe('error'); expect(state.extraction).toBeNull(); expect(codes(state)).toContain('ai_cache_malformed');
  });
  it('同号历史排自身且保留退回风险，前导零不同不视同号', async () => {
    const a = await installAnalysis(); rows.push({ ...rows[0], id: 11, aj_status: 'rejected', amount: '101.00', description: '历史' });
    logs.push({ id: 60, record_id: 11, field_name: 'aj_ai_analysis', new_value: JSON.stringify(a) }); let state = await getAJInvoiceAIResult(identity);
    expect(state.duplicates.map(x => x.recordId)).toEqual([11]); expect(state.duplicates[0].status).toBe('rejected');
    a.extraction.invoices[0].invoiceNumber = '123'; logs[1].new_value = JSON.stringify(a); state = await getAJInvoiceAIResult(identity); expect(state.duplicates).toHaveLength(0);
  });
  it('票面混合事项、缺映射、关闭项目不auto', async () => {
    const a = await installAnalysis(); a.extraction.invoices[0].items.push('餐饮'); a.mixedItems = true; logs[0].new_value = JSON.stringify(a);
    let state = await getAJInvoiceAIResult(identity); expect(codes(state)).toContain('mixed_invoice_items'); expect(codes(state)).toContain('mixed_items');
    config.office.accountingMap = {}; state = await getAJInvoiceAIResult(identity); expect(state.state).toBe('stale');
    logs = []; await installAnalysis(); state = await getAJInvoiceAIResult(identity); expect(codes(state)).toContain('accounting_mapping_missing');
    config.office.enabled = false; logs = []; await installAnalysis(); state = await getAJInvoiceAIResult(identity); expect(state.classification.candidates).toHaveLength(0);
  });
  it('未识别历史阻止auto，普通worker scope没有他人历史分支', async () => {
    await installAnalysis(); rows.push({ ...rows[0], id: 11, amount: '105.00', images: '["https://store.example.com/receipts/new.jpg"]' });
    let state = await getAJInvoiceAIResult(identity); expect(codes(state)).toContain('history_not_fully_analyzed');
    rows.pop(); role = 'worker'; state = await getAJInvoiceAIResult(identity); expect(codes(state)).toContain('auto_scope_restricted');
    expect(queries.filter(q => q.sql.startsWith('SELECT lr.*, c.name')).at(-1)?.sql).toContain('c.id IS NOT NULL AND lr.createdBy=?');
    rows[0].createdBy = 8; await expect(getAJInvoiceAIResult(identity)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('已批准/完成/已有津贴不能识别或归类，不涉及津贴写入', async () => {
    rows[0].aj_status = 'approved'; const state = await getAJInvoiceAIResult(identity); expect(state.canAnalyze).toBe(false); expect(state.canConfirm).toBe(false);
    await expect(analyzeAJInvoice(identity)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(confirmAJInvoiceClassification({ ...identity, taxCategory: '办公费' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(queries.every(q => !/^(?:INSERT|UPDATE|CREATE|ALTER)/.test(q.sql))).toBe(true);
  });
  it('企业配置未知目录、非法科目、人工未知科目均拒绝', () => {
    expect(() => validateAJExpenseConfig(config)).not.toThrow();
    expect(() => validateAJExpenseConfig({ unknown: { enabled: true, items: {} } })).toThrow();
    expect(() => validateAJExpenseConfig({ office: { enabled: true, items: { fake: true } } })).toThrow();
    expect(() => validateAJExpenseConfig({ office: { enabled: true, items: {}, accountingMap: { supplies: '6602' } } })).toThrow();
  });
  it('同单并发识别拒绝第二次收费请求，失败释放所有命名锁及连接', async () => {
    let fail!: (reason: Error) => void;
    const invocation = vi.spyOn(vision, 'invokeAJInvoiceVision').mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    const first = analyzeAJInvoice(identity);
    const failure = expect(first).rejects.toThrow('离线模拟失败');
    await vi.waitFor(() => expect(invocation).toHaveBeenCalledOnce());
    await expect(analyzeAJInvoice(identity)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(invocation).toHaveBeenCalledOnce(); fail(new Error('离线模拟失败')); await failure;
    expect(queries.filter(q => q.sql.startsWith('SELECT RELEASE_LOCK'))).toHaveLength(2); expect(conn.release).toHaveBeenCalledOnce();
  });
});
