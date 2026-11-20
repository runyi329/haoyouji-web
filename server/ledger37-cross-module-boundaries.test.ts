import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
const deps = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, withDatabaseLock: vi.fn() }));
import { assertLedger37Owner, assertLedger37ResourceOwner, assertLedger37SelfRead, getLedger37Access } from './ledger37-calendar-recorder';

// Never import routers/db-ai-employee: their legacy module initializers can migrate tables/start timers.
// Execute only actual production AST callbacks/functions with entirely offline dependencies.
const source = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('routers.ts', source, ts.ScriptTarget.Latest, true);
const aiAst = ts.createSourceFile('db-ai-employee.ts', readFileSync(new URL('./db-ai-employee.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function find<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T, predicate: (node: T) => boolean): T {
  let found: T | undefined;
  const visit = (node: ts.Node) => { if (!found && guard(node) && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(root); if (!found) throw new Error('Missing actual production AST'); return found;
}
function compile(code: string, bindings: Record<string, any> = {}): any {
  const output = ts.transpileModule(`(${code})`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(output, { TRPCError, assertLedger37Owner, assertLedger37ResourceOwner, assertLedger37SelfRead, getLedger37Access,
    getDbConnection: deps.db, console: { log() {}, error() {} }, process: undefined, require: undefined,
    fetch: () => { throw new Error('Network prohibited'); }, ...bindings }, { timeout: 1000 });
}
function productionFunction(name: string, root = ast, bindings: Record<string, any> = {}) {
  const node = find(root, ts.isFunctionDeclaration, n => n.name?.text === name);
  return compile(node.getText(root).replace(/^export\s+/, ''), bindings);
}
const taskGuard = productionFunction('assertLedger37AIEmployeeTaskOwner');
const ajGuard = productionFunction('assertLedger37AjResourceOwner');
function handler(name: string, bindings: Record<string, any> = {}) {
  const prop = find(ast, ts.isPropertyAssignment, n => n.name.getText(ast) === name && n.initializer.getText(ast).startsWith('protectedProcedure'));
  const call = find(prop, ts.isCallExpression, n => ts.isPropertyAccessExpression(n.expression) && ['query', 'mutation'].includes(n.expression.name.text));
  const code = call.arguments[0].getText(ast).replaceAll("await import('./db')", '__db').replaceAll("await import('./price-scanner')", '__prices');
  return compile(code, { __db: { getDbConnection: deps.db }, __prices: { getAllLatestPrices: () => ({}) },
    assertLedger37AIEmployeeTaskOwner: taskGuard, assertLedger37AjResourceOwner: ajGuard,
    assertLedger37RawPresentationRead: async () => {}, ...bindings });
}
const actor = (systemRole = 'member', userId = 201): any => ({ user: { id: userId, role: systemRole }, realUser: { id: userId }, isViewingAs: false });
const owner = actor('super_admin', 100);
const input = { ledgerId: 37, categoryId: 2, recordId: 3, companyId: 4, requestId: 5, userId: 202,
  taskId: 6, status: 'stopped', period: 'all', name: 'test', categoryName: 'test', taxCategory: 'test', accountingCode: 'test', expenseReason: 'test', role: 'admin' };
function fixture(options: { role?: string; resourceLedger?: number; memberless?: boolean; task?: any; pending?: any[] } = {}) {
  const log: Array<{ sql: string; values: any[] }> = [], writes = vi.fn();
  const execute = vi.fn(async (sql: string, values: any[] = []) => {
    log.push({ sql, values });
    if (/FROM ledgers l/.test(sql)) return [[{ ownerId: 100, memberRole: options.role ?? 'admin',
      memberUserId: options.memberless ? null : values[0], initialBalances: '{}' }]];
    if (/SELECT .* AS ledgerId FROM/.test(sql)) return [[{ ledgerId: options.resourceLedger ?? 37 }]];
    if (/SELECT ledger_id, user_id FROM ai_employee_tasks/.test(sql)) return [[...(options.task === null ? [] : [options.task ?? { ledger_id: 37, user_id: 201 }])]];
    if (/SELECT ledger_id FROM aj_/.test(sql)) return [[{ ledger_id: options.resourceLedger ?? 37 }]];
    if (/FROM ledger_members/.test(sql)) return [[{ id: 1, role: options.role ?? 'admin' }]];
    if (/FROM ledger_records lr/.test(sql)) return [options.pending ?? []];
    if (/SELECT id FROM ledger_categories/.test(sql)) return [[]];
    if (/SELECT c.id, c.name/.test(sql)) return [[{ id: 2, name: 'test', sort_order: 0, entry_count: 0 }]];
    if (/^(?:UPDATE|INSERT|DELETE|CREATE|ALTER)/.test(sql.trim())) { writes(sql, values); return [{ insertId: 90, affectedRows: 1 }]; }
    throw new Error(`Unexpected offline SQL: ${sql}`);
  });
  deps.db.mockResolvedValue({ execute });
  return { log, writes, execute };
}
beforeEach(() => vi.clearAllMocks());
const managementRoutes = ['ajCreateCompany', 'ajUpdateCompany', 'ajDeleteCompany', 'ajGetCompanyAccess', 'ajToggleCompanyAccess',
  'ajBatchDisableWorkers', 'ajBatchEnableAllWorkers', 'ajUpdateMemberRole', 'ajSetCompanyExpenseTypes', 'ajAdminGetPendingRequests', 'ajAdminReviewRequest',
  'ajOwnerGetMyCompanies', 'ajOwnerGetMyRequests', 'ajOwnerSubmitRequest', 'ajOwnerCancelRequest', 'ajOwnerGetCompanyStats',
  'ajOwnerGetCompanyInvoices', 'ajOwnerGetEmployeeStats', 'ajOwnerBatchApprove', 'ajOwnerGetPendingList',
  'ajOwnerUpdateInvoiceCategory', 'ajOwnerUpdateTaxCategory', 'ajOwnerUpdateAccountingCode', 'ajOwnerUpdateExpenseReason', 'deleteBranch', 'getBranches'];

describe('37跨模块边界：真实生产AST+真实owner/resource/self helper，全离线', () => {
  it.each(managementRoutes)('%s普通账本admin（含系统super_admin）第一DDL/资金写前403', async name => {
    for (const role of ['member', 'admin', 'super_admin']) {
      const f = fixture(), downstream = vi.fn();
      await expect(handler(name, { dbAIEmployee: { updateTaskStatus: downstream, getTaskLogs: downstream } })({ ctx: actor(role), input })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(f.writes).not.toHaveBeenCalled(); expect(downstream).not.toHaveBeenCalled();
      expect(f.log.length).toBeGreaterThan(0); expect(f.log.every(q => q.sql.trim().startsWith('SELECT'))).toBe(true);
    }
  });
  it.each(['ajOwnerUpdateInvoiceCategory', 'ajOwnerUpdateTaxCategory', 'ajOwnerUpdateAccountingCode', 'ajOwnerUpdateExpenseReason'])('%s谎报52也按recordId实际37拒绝，在创建分类前', async name => {
    const f = fixture();
    await expect(handler(name)({ ctx: actor('super_admin'), input: { ...input, ledgerId: 52 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.log[0].sql).toContain('FROM ledger_records WHERE id'); expect(f.log[0].values).toEqual([3]); expect(f.writes).not.toHaveBeenCalled();
  });
  it.each(['ajDeleteCompany', 'ajToggleCompanyAccess', 'ajSetCompanyExpenseTypes', 'ajAdminReviewRequest', 'ajOwnerCancelRequest'])('%s谎报52不能通过真实37企业/申请ID先做ID-only写', async name => {
    const f = fixture();
    await expect(handler(name)({ ctx: actor('super_admin'), input: { ...input, ledgerId: 52 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.writes).not.toHaveBeenCalled(); expect(f.log[0].sql).toContain('SELECT ledger_id FROM aj_');
  });
  it('批审先预检整个真实结果集：52记录在前/37在后也不能先更新或发津贴', async () => {
    const f = fixture({ resourceLedger: 52, pending: [{ id: 8, ledgerId: 52, createdBy: 202, amount: 100 }, { id: 9, ledgerId: 37, createdBy: 203, amount: 100 }] });
    const network = vi.fn(() => { throw new Error('no network'); });
    await expect(handler('ajOwnerBatchApprove', { fetch: network })({ ctx: actor('super_admin'), input: { ...input, ledgerId: 52, companyId: undefined } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(network).not.toHaveBeenCalled(); expect(f.writes).not.toHaveBeenCalled();
  });
  it('伪owner memberRole或代看真实owner均不能删37分类', async () => {
    const f = fixture({ role: 'owner' });
    await expect(handler('deleteBranch')({ ctx: actor('super_admin'), input })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(handler('deleteBranch')({ ctx: { ...owner, isViewingAs: true }, input })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.writes).not.toHaveBeenCalled();
  });
  it('37分店原始AI守卫同样作用于owner读取，拒绝在分类数据前', async () => {
    const f = fixture(), raw = vi.fn(async () => { throw new TRPCError({ code: 'FORBIDDEN' }); });
    await expect(handler('getBranches', { assertLedger37RawPresentationRead: raw })({ ctx: owner, input })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(raw).toHaveBeenCalledWith(owner, 37); expect(f.log).toHaveLength(1); expect(f.writes).not.toHaveBeenCalled();
  });
  it.each(['deleteBranch', 'ajCreateCompany', 'ajOwnerUpdateInvoiceCategory', 'ajOwnerUpdateTaxCategory', 'ajOwnerUpdateAccountingCode', 'ajOwnerUpdateExpenseReason'])('%s真实37owner保留管理路径，仅离线mock写', async name => {
    const f = fixture({ role: 'owner' });
    await expect(handler(name)({ ctx: owner, input })).resolves.toBeDefined();
    expect(f.writes).toHaveBeenCalled(); expect(f.log.some(q => q.sql.includes('FROM ledgers l'))).toBe(true);
  });
  it.each(['deleteBranch', 'ajCreateCompany', 'ajOwnerUpdateInvoiceCategory', 'ajOwnerUpdateTaxCategory', 'ajOwnerUpdateAccountingCode', 'ajOwnerUpdateExpenseReason'])('%s非37保留原管理路径，不查询37权限', async name => {
    const f = fixture({ resourceLedger: 52 });
    await expect(handler(name)({ ctx: actor('super_admin'), input: { ...input, ledgerId: 52 } })).resolves.toBeDefined();
    expect(f.writes).toHaveBeenCalled(); expect(f.log.some(q => q.sql.includes('FROM ledgers l'))).toBe(false);
  });
  it('非37批审空记录以及分店读取保持原行为，owner helper是noop', async () => {
    const f = fixture({ resourceLedger: 52 });
    await expect(handler('ajOwnerBatchApprove')({ ctx: actor(), input: { ...input, ledgerId: 52, companyId: undefined } })).resolves.toMatchObject({ approved: 0 });
    await expect(handler('getBranches')({ ctx: actor('super_admin'), input: { ledgerId: 52 } })).resolves.toHaveLength(1);
    expect(f.log.some(q => q.sql.includes('FROM ledgers l'))).toBe(false); expect(f.writes).not.toHaveBeenCalled();
  });
  it.each(['updateAIEmployeeTaskStatus', 'getAIEmployeeTaskLogs'])('%s只有taskId也解析真实ledger_id并在旧handler之前拒绝37admin', async name => {
    const f = fixture(), downstream = vi.fn();
    await expect(handler(name, { dbAIEmployee: { updateTaskStatus: downstream, getTaskLogs: downstream } })({ ctx: actor('super_admin'), input: { taskId: 6, status: 'stopped', ledgerId: 52 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.log[0].sql).toContain('SELECT ledger_id, user_id FROM ai_employee_tasks'); expect(f.log[0].values).toEqual([6]);
    expect(downstream).not.toHaveBeenCalled(); expect(f.writes).not.toHaveBeenCalled();
  });
  it.each(['updateAIEmployeeTaskStatus', 'getAIEmployeeTaskLogs'])('%s非37自己的任务保持可用，未知或他人任务在旧handler前拒绝', async name => {
    const downstream = vi.fn(async () => ({ success: true })), call = handler(name, { dbAIEmployee: { updateTaskStatus: downstream, getTaskLogs: downstream } });
    fixture({ task: { ledger_id: 52, user_id: 201 } });
    await expect(call({ ctx: actor(), input: { taskId: 6, status: 'paused' } })).resolves.toMatchObject({ success: true });
    expect(downstream).toHaveBeenCalledOnce(); downstream.mockClear();
    fixture({ task: { ledger_id: 52, user_id: 202 } });
    await expect(call({ ctx: actor(), input: { taskId: 6, status: 'paused' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    fixture({ task: null });
    await expect(call({ ctx: actor(), input: { taskId: 6, status: 'paused' } })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(downstream).not.toHaveBeenCalled();
  });
  it('真实37owner仅能操作自己的AI任务，代看仍不能操作', async () => {
    fixture({ task: { ledger_id: 37, user_id: 100 } });
    const downstream = vi.fn(async () => ({ success: true })), call = handler('updateAIEmployeeTaskStatus', { dbAIEmployee: { updateTaskStatus: downstream } });
    await expect(call({ ctx: owner, input: { taskId: 6, status: 'stopped' } })).resolves.toMatchObject({ success: true });
    await expect(call({ ctx: { ...owner, isViewingAs: true }, input: { taskId: 6, status: 'stopped' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(downstream).toHaveBeenCalledOnce();
  });
  it.each(['paused', 'stopped', 'running'])('生产updateTaskStatus %s未知/他人任务不会UPDATE或stop/startTimer', async status => {
    const execute = vi.fn(async (_sql: string, _values: any[]) => [[]]); deps.db.mockResolvedValue({ execute });
    const stop = vi.fn(), start = vi.fn();
    const update = productionFunction('updateTaskStatus', aiAst, { stopTaskTimer: stop, startTaskTimer: start, getIntervalMs: () => 60000 });
    await expect(update(6, 201, status)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(execute).toHaveBeenCalledOnce(); expect(execute.mock.calls[0][0]).toContain('AND user_id = ?');
    expect(stop).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  });
  it('生产updateTaskStatus自己暂停/恢复保留，定时器只用user_id二次确认后的任务', async () => {
    const execute = vi.fn(async (sql: string) => sql.startsWith('UPDATE') ? [{ affectedRows: 1 }] : [[{ id: 6, ledger_id: 52, user_id: 201, parsed_plan: {}, schedule_type: 'every_minute' }]]);
    deps.db.mockResolvedValue({ execute }); const stop = vi.fn(), start = vi.fn();
    const update = productionFunction('updateTaskStatus', aiAst, { stopTaskTimer: stop, startTaskTimer: start, getIntervalMs: () => 60000 });
    await expect(update(6, 201, 'paused')).resolves.toMatchObject({ success: true }); expect(stop).toHaveBeenCalledWith(6);
    await expect(update(6, 201, 'running')).resolves.toMatchObject({ success: true }); expect(start).toHaveBeenCalledWith(6, 52, 201, {}, 60000);
    expect(execute.mock.calls.every(([sql]) => sql.includes('user_id = ?'))).toBe(true);
  });
  it('生产updateTaskStatus写后任务消失/归属变化不停止他人定时器', async () => {
    const execute = vi.fn().mockResolvedValueOnce([[{ id: 6 }]]).mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    deps.db.mockResolvedValue({ execute }); const stop = vi.fn();
    await expect(productionFunction('updateTaskStatus', aiAst, { stopTaskTimer: stop })(6, 201, 'paused')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(stop).not.toHaveBeenCalled();
  });
  it.each(['afGetMyTotalAsset', 'afGetMyRechargeHistory'])('%s37跨用户普通admin/systemadmin拒绝在钱包查询前', async name => {
    for (const role of ['member', 'admin', 'super_admin']) {
      fixture(); const walletDb = vi.fn();
      await expect(handler(name, { getLedgerDb: walletDb })({ ctx: actor(role), input: { ledgerId: 37, viewAsUserId: 100 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(walletDb).not.toHaveBeenCalled();
    }
  });
  it('37普通member本人总资产钱包保持可读（无AI raw总封锁）', async () => {
    fixture({ role: 'member' });
    const sql: any = (parts: TemplateStringsArray, ...values: any[]) => ({ text: parts.join('?'), values }); sql.join = () => '';
    const execute = vi.fn(async (query: any) => {
      expect(query.text.trim().startsWith('SELECT')).toBe(true);
      if (query.text.includes('as userBalance')) return [[{ userBalance: 12, manual: 3 }]];
      if (query.text.includes('invite_count')) return [[{ invite_count: 0 }]];
      return [[]];
    });
    await expect(handler('afGetMyTotalAsset', { getLedgerDb: async () => ({ execute }), sql, AI_WALLET_MARKET_ASSETS: ['ETH'] })({ ctx: actor(), input: { ledgerId: 37 } })).resolves.toMatchObject({ total: 15, available: 15, frozen: 0 });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it.each([{ ledgerId: 37 }, { ledgerId: 37, viewAsUserId: 201 }, {}])('本人充值钱包保留含同人viewAs及全局口径 %j', async request => {
    fixture({ role: 'member' });
    const sql: any = (parts: TemplateStringsArray, ...values: any[]) => ({ text: parts.join('?'), values });
    const execute = vi.fn(async (query: any) => { expect(query.text.trim().startsWith('SELECT')).toBe(true); return [[]]; });
    const freeze = vi.fn(async () => []), require52 = vi.fn();
    await expect(handler('afGetMyRechargeHistory', { getLedgerDb: async () => ({ execute }), sql,
      listWalletManualFundingFreezeEvents: freeze, requireLedger52Creator: require52 })({ ctx: actor(), input: request })).resolves.toEqual([]);
    expect(execute).toHaveBeenCalled(); expect(freeze).toHaveBeenCalledWith(201); expect(require52).not.toHaveBeenCalled();
  });
  it('memberless 37 FORBIDDEN只令includeLedger37=false，不阻断其他账本清理', async () => {
    fixture({ memberless: true }); const purge = vi.fn(async value => ({ include37: value }));
    await expect(handler('purgeExpiredDeletedRecords', { dbLedger: { purgeExpiredDeletedRecords: purge } })({ ctx: actor() })).resolves.toEqual({ include37: false });
    expect(purge).toHaveBeenCalledWith(false);
  });
  it('普通admin隔离37、真实owner包含37、代看owner不包含37', async () => {
    fixture(); const purge = vi.fn(async value => value), call = handler('purgeExpiredDeletedRecords', { dbLedger: { purgeExpiredDeletedRecords: purge } });
    await expect(call({ ctx: actor('super_admin') })).resolves.toBe(false);
    await expect(call({ ctx: owner })).resolves.toBe(true);
    await expect(call({ ctx: { ...owner, isViewingAs: true } })).resolves.toBe(false);
    expect(purge.mock.calls.map(args => args[0])).toEqual([false, true, false]);
  });
  it('回收清理不能把数据库故障伪装成权限false继续写', async () => {
    deps.db.mockRejectedValue(new Error('offline database failure')); const purge = vi.fn();
    await expect(handler('purgeExpiredDeletedRecords', { dbLedger: { purgeExpiredDeletedRecords: purge } })({ ctx: actor() })).rejects.toThrow('offline database failure');
    expect(purge).not.toHaveBeenCalled();
  });
});
