import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
const deps = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, withDatabaseLock: vi.fn() }));
import { assertLedger37Owner, assertLedger37ResourceOwner, assertLedger37SelfRead, getLedger37Access } from './ledger37-calendar-recorder';
const source = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('routers.ts', source, ts.ScriptTarget.Latest, true);
const ledgerNode = find(ast, ts.isPropertyAssignment, n => n.name.getText(ast) === 'ledger' && n.initializer.getText(ast).startsWith('router('));
function find<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T, predicate: (node: T) => boolean): T {
  let found: T | undefined;
  const visit = (node: ts.Node) => { if (!found && guard(node) && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(root); if (!found) throw new Error('Missing actual source'); return found;
}
function handler(name: string, bindings: Record<string, any> = {}) {
  const prop = find(name.startsWith('admin') && ['adminAddDividend', 'adminDeleteDividend', 'adminEditDividend', 'adminGetAllDividends', 'adminAddNote', 'adminDeleteNote', 'adminGetLedger37DividendRecoveryWalletBalance', 'adminRecoverLedger37Dividend', 'adminExecuteLedger37DividendBatch', 'adminRevokeLedger37Dividend', 'adminGetLedger37DividendAvailability', 'adminGetLedger37MemberWalletSnapshot'].includes(name) || ['getDividendSummary', 'getDividendRecords', 'getAdminNotes', 'getAdminNoteCounts', 'updateDividendNote'].includes(name) ? ast : ledgerNode, ts.isPropertyAssignment, n => n.name.getText(ast) === name && n.initializer.getText(ast).startsWith('protectedProcedure'));
  const call = find(prop, ts.isCallExpression, n => ts.isPropertyAccessExpression(n.expression) && ['query', 'mutation'].includes(n.expression.name.text));
  const code = ts.transpileModule(`(${call.arguments[0].getText(ast)})`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(code, { TRPCError, assertLedger37Owner, assertLedger37ResourceOwner, assertLedger37SelfRead, getLedger37Access, ...bindings }, { timeout: 1000 }) as (args: any) => Promise<any>;
}
const admin = { user: { id: 201, role: 'super_admin' }, realUser: { id: 201 }, isViewingAs: false };
const owner = { user: { id: 100, role: 'member' }, realUser: { id: 100 }, isViewingAs: false };
const write = vi.fn();
function fixture(role = 'admin', ledgerId = 37) {
  const log: string[] = [];
  deps.db.mockResolvedValue({ execute: vi.fn(async (sql: string, values: any[] = []) => {
    log.push(sql);
    if (/FROM ledgers l/.test(sql)) return [[{ ownerId: 100, memberRole: role, memberUserId: values[0], initialBalances: '{}' }]];
    if (/SELECT .* AS ledgerId FROM/.test(sql)) return [[{ ledgerId }]];
    throw new Error('DB function / write unexpectedly reached');
  }) });
  return { log };
}
beforeEach(() => { vi.clearAllMocks(); });
const managers = 'updateLedgerFeatures update archive delete copy generateInviteToken inviteMember removeMember transferOwnership getSecretKey addCategory replaceCategory getCategoryUsageCount getMemberPermissions updateMemberPermission updateDefaultPermission getAIEmployees toggleAIEmployee addAIEmployee removeAIEmployee importRecords adminGetAllInitialBalances adminGetMemberTagHideImpact adminSetMemberInitialBalances adminGetOrdinaryTagObservationConfig adminSetOrdinaryTagObservationConfig adminGetOrdinaryTagClearImpact adminClearOrdinaryTagMemberConfig setTagPauseDate setTagMarginPauseDate saveTagConfig getMarginLogs addMarginLog deleteMarginLog getTagInterestSettings saveTagInterestSetting getTagInterestManualLogs getTagInterestOperationLogs addTagInterestManualLog deleteTagInterestManualLog getTagInterestPeriods addTagInterestPeriod updateTagInterestPeriod deleteTagInterestPeriod getShortcutButtons updateShortcutButtons getDeletedTransactions getChangeRequests getApprovalRules saveApprovalRules getPendingApprovals getApprovalHistory exportToExcel setMemberRole getExportStats getBackupSettings saveBackupSettings sendTestBackup setStockLotObservation updateStockTagLotNote setStockLotParticipation addStockTagEvent updateStockTagSale voidStockTagEvent correctStockTagEvent adminAddDividend adminDeleteDividend adminEditDividend adminGetAllDividends adminAddNote adminDeleteNote'.split(' ');
const fixed = 'deleteLedger37ManualMarginMigration getLedger37WalletMarginContext getLedger37ManualMarginMigrationPlan getLedger37MarginMigrationReconciliationPreview migrateAllLedger37ManualMarginsToWalletHolds migrateLedger37ManualMarginToWalletHold freezeLedger37MarginFromWallet releaseLedger37MarginToWallet revokeLedger37MarginReleaseToWallet repairLedger37MarginReleasePresentation releaseLedger37PausedTagMarginsToWallet settleLedger37PausedTag adminGetLedger37DividendRecoveryWalletBalance adminRecoverLedger37Dividend adminExecuteLedger37DividendBatch adminRevokeLedger37Dividend adminGetLedger37DividendAvailability adminGetLedger37MemberWalletSnapshot'.split(' ');
const resources = 'updateTransaction deleteTransaction restoreTransaction deleteCategory updateCategory submitChangeRequest getRecordChangeRequest reviewChangeRequest withdrawChangeRequest deleteApprovalRule approveTransaction ajSetStatus manageReimbursement getReimbursementHistory'.split(' ');
describe('37真实路由源代码：管理员只能专用日历数字、所有管理拒绝在第一写之前', () => {
  it.each([...managers, ...fixed, ...resources])('%s普通ledger admin即使系统super_admin也403无下游/DDL', async name => {
    const f = fixture();
    const call = handler(name, { dbLedger: new Proxy({}, { get: () => write }) });
    await expect(call({ ctx: admin, input: { ledgerId: 37, recordId: 1, categoryId: 2, ruleId: 3, requestId: 4, transactionId: 5, scopedOrdinaryCategoryId: 2, balances: {} } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(write).not.toHaveBeenCalled(); expect(f.log.every(sql => /^SELECT/.test(sql))).toBe(true);
  });
  it('通用add管理员403，即使overwrite和viewAs owner也第一写之前拒绝', async () => {
    fixture(); const call = handler('addTransaction', { dbLedger: { addTransaction: write } });
    await expect(call({ ctx: admin, input: { ledgerId: 37, type: 'transfer', amount: 1, overwriteExisting: true, viewAsUserId: 100 } })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(write).not.toHaveBeenCalled();
  });
  it.each(['update', 'archive', 'updateLedgerFeatures', 'adminSetMemberInitialBalances'])('%s伪owner role与代看真正owner都不能升级', async name => {
    fixture('owner'); const call = handler(name, { dbLedger: new Proxy({}, { get: () => write }) });
    await expect(call({ ctx: admin, input: { ledgerId: 37 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(call({ ctx: { ...owner, isViewingAs: true }, input: { ledgerId: 37 } })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(write).not.toHaveBeenCalled();
  });
  it.each(['addTransaction', 'updateTransaction', 'update', 'archive', 'updateLedgerFeatures', 'deleteCategory', 'updateCategory', 'replaceCategory'])('%s真正owner继续管理', async name => {
    fixture(); write.mockResolvedValue({ success: true }); const call = handler(name, { dbLedger: new Proxy({}, { get: () => write }) });
    await expect(call({ ctx: owner, input: { ledgerId: 37, recordId: 1, categoryId: 2, name: "测试" } })).resolves.toMatchObject({ success: true }); expect(write).toHaveBeenCalledOnce();
  });
  it.each(['addTransaction', 'update', 'archive', 'updateLedgerFeatures', 'replaceCategory'])('%s非37继续原路由行为且helper不查37', async name => {
    fixture('admin', 52); write.mockResolvedValue({ success: true }); const call = handler(name, { dbLedger: new Proxy({}, { get: () => write }) });
    await call({ ctx: admin, input: { ledgerId: 52 } }); expect(write).toHaveBeenCalledOnce(); if (name !== 'replaceCategory') expect(deps.db).not.toHaveBeenCalled();
  });
  it.each(['getReport', 'getCalendarData', 'getDayRecords', 'getTransactionDetail'])('%sAI原始读先守卫，没有admin豁免', async name => {
    const guard = vi.fn(async () => { throw new TRPCError({ code: 'FORBIDDEN' }); });
    await expect(handler(name, { assertLedger37RawPresentationRead: guard, dbLedger: new Proxy({}, { get: () => write }) })({ ctx: admin, input: { ledgerId: 37 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(guard).toHaveBeenCalledWith(admin, 37); expect(write).not.toHaveBeenCalled();
  });
  it.each(['getMyInitialBalances', 'getMyShortcutButtons', 'getDividendSummary', 'getDividendRecords', 'getAdminNotes', 'getAdminNoteCounts'])('%sadmin不能跨人读', async name => {
    fixture(); await expect(handler(name)({ ctx: admin, input: { ledgerId: 37, viewAsUserId: 100, userId: 100 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('普通37member合法本人memo/昵称/钱包/分红备注未加owner总封锁', () => {
    for (const name of ['createPersonalMemo', 'updatePersonalMemo', 'deletePersonalMemo', 'updateMemberNickname', 'updateDividendNote']) {
      const prop = find(name.startsWith('admin') && ['adminAddDividend', 'adminDeleteDividend', 'adminEditDividend', 'adminGetAllDividends', 'adminAddNote', 'adminDeleteNote', 'adminGetLedger37DividendRecoveryWalletBalance', 'adminRecoverLedger37Dividend', 'adminExecuteLedger37DividendBatch', 'adminRevokeLedger37Dividend', 'adminGetLedger37DividendAvailability', 'adminGetLedger37MemberWalletSnapshot'].includes(name) || ['getDividendSummary', 'getDividendRecords', 'getAdminNotes', 'getAdminNoteCounts', 'updateDividendNote'].includes(name) ? ast : ledgerNode, ts.isPropertyAssignment, n => n.name.getText(ast) === name && n.initializer.getText(ast).startsWith('protectedProcedure'));
      expect(prop.getText(ast)).not.toContain('assertLedger37Owner');
    }
  });
});
