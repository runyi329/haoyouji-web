import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getDbConnection, withDatabaseLock } from './db';
import { isLedger37FullManager, canRecordLedger37Calendar } from '../shared/ledger37-permissions';
import { getLedgerRecordDateError } from '../shared/ledger-record-date';
import { readTagVisible } from '../shared/tag-visibility';
import { decryptValue } from './encryption';

export type Ledger37Actor = {
  user: { id: number };
  realUser?: { id: number } | null;
  isViewingAs?: boolean;
};
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const date = z.string().refine(value => !getLedgerRecordDateError(37, value), '日期必须有效且不能晚于北京时间今天');
export const calendarNumberCategoriesSchema = z.object({ ledgerId: z.literal(37) }).strict();
export const calendarNumberSchema = z.object({ ledgerId: z.literal(37), categoryId: id, date }).strict();
export const saveCalendarNumberSchema = calendarNumberSchema.extend({
  // ledger_records.amount is DECIMAL(10,2). Reject rounding and overflow rather than silently altering the number.
  amount: z.number().finite().min(0).max(99999999.99).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, '金额最多两位小数'),
  overwriteExisting: z.boolean().optional(),
}).strict();

function fail(message: string): never { throw new TRPCError({ code: 'FORBIDDEN', message }); }
function realActor(ctx: Ledger37Actor): boolean {
  return !ctx.isViewingAs && (!ctx.realUser || ctx.realUser.id === ctx.user.id);
}
function balancesOf(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined || raw === '') return {};
  let result: unknown;
  try { result = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return fail('成员标签设置损坏，无法登记'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return fail('成员标签设置损坏，无法登记');
  return result as Record<string, unknown>;
}
export async function getLedger37Access(ctx: Ledger37Actor, conn?: any) {
  const connection = conn ?? await getDbConnection();
  if (!connection) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接不可用' });
  // Do not trust ledger_members.role=owner, system roles, usernames, or a viewing-as realUser.
  const [rows] = await connection.execute(`SELECT l.ownerId, m.role AS memberRole, m.initial_balances AS initialBalances,
    m.permission_add AS permissionAdd, m.userId AS memberUserId
    FROM ledgers l LEFT JOIN ledger_members m ON m.ledgerId = l.id AND m.userId = ?
      AND (m.member_type IS NULL OR m.member_type <> 'ai')
    WHERE l.id = 37 ORDER BY m.id ASC LIMIT 1`, [ctx.user.id]);
  const row = rows?.[0];
  if (!row) return fail('37号账本不存在或无权访问');
  const permission = { ledgerId: 37, userId: ctx.user.id, ownerId: row.ownerId, memberRole: row.memberRole, isViewingAs: !realActor(ctx) };
  const canManage = isLedger37FullManager(permission);
  if (!canManage && Number(row.memberUserId) !== ctx.user.id) return fail('您不是37号账本真实成员');
  return { connection, row, canManage, canRecordCalendar: canRecordLedger37Calendar(permission) };
}
/** No-op outside ledger 37. All denials precede migrations, locks, or writes. */
export async function assertLedger37Owner(ctx: Ledger37Actor, ledgerId: number): Promise<void> {
  if (Number(ledgerId) !== 37) return;
  if (!realActor(ctx)) return fail('代看身份不能管理37号账本');
  if (!(await getLedger37Access(ctx)).canManage) return fail('37号账本管理仅真实账本所有者可操作');
}
export async function assertLedger37ResourceOwner(ctx: Ledger37Actor, kind: 'record' | 'category' | 'rule' | 'request', resourceId: number): Promise<void> {
  const resources = {
    record: ['ledger_records', 'ledgerId'], category: ['ledger_categories', 'ledgerId'],
    rule: ['ledger_approval_rules', 'ledgerId'], request: ['ledger_change_requests', 'ledger_id'],
  } as const;
  const [table, column] = resources[kind];
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接不可用' });
  const [rows] = await conn.execute<import('mysql2').RowDataPacket[]>(`SELECT ${column} AS ledgerId FROM ${table} WHERE id = ? LIMIT 1`, [resourceId]);
  if (rows?.[0]) await assertLedger37Owner(ctx, Number(rows[0].ledgerId));
}
/** Explicit cross-person reads require owner, while ordinary self reads retain member semantics. */
export async function assertLedger37SelfRead(ctx: Ledger37Actor, ledgerId: number, targetUserId?: number, allMembers = false): Promise<void> {
  if (Number(ledgerId) !== 37) return;
  if (allMembers || (targetUserId !== undefined && targetUserId !== ctx.user.id)) await assertLedger37Owner(ctx, 37);
  else await getLedger37Access(ctx);
}
async function recordScope(ctx: Ledger37Actor, conn?: any) {
  if (!realActor(ctx)) return fail('代看身份不能登记日历数字');
  const scope = await getLedger37Access(ctx, conn);
  if (!scope.canRecordCalendar) return fail('只有真实账本所有者或账本管理员可登记日历数字');
  // 37号真实admin拥有独立的日历余额/照片权限。旧permission_add只属于
  // 通用账目权限，不能关闭这一窄能力；这里也绝不修改或放开通用管理权限。
  return { ...scope, balances: balancesOf(scope.row.initialBalances) };
}
function eligible(category: any, scope: Awaited<ReturnType<typeof recordScope>>): boolean {
  return Number(category.ledgerId) === 37 && category.parentId == null && !Number(category.isDefault)
    && category.accountingMode === 'manual_balance' && ['income', 'expense'].includes(category.type)
    && (scope.canManage || readTagVisible(scope.balances, String(category.name)));
}
async function categoryScope(ctx: Ledger37Actor, input: z.infer<typeof calendarNumberSchema>, conn?: any) {
  const dateError = getLedgerRecordDateError(37, input.date);
  if (dateError) throw new TRPCError({ code: 'BAD_REQUEST', message: dateError });
  const scope = await recordScope(ctx, conn);
  const [categories] = await scope.connection.execute(`SELECT id, ledgerId, name, parentId, isDefault,
    accounting_mode AS accountingMode, type FROM ledger_categories WHERE id = ? AND ledgerId = 37 LIMIT 1`, [input.categoryId]);
  const category = categories?.[0];
  if (!category || !eligible(category, scope)) return fail('该标签不属于可见的37号顶级普通余额标签');
  const [configs] = await scope.connection.execute(`SELECT pause_date, margin_pause_date, end_date FROM ledger_tag_config
    WHERE ledger_id = 37 AND BINARY tag_name = BINARY ? LIMIT 1`, [category.name]);
  const config = configs?.[0];
  const cutoff = config?.margin_pause_date ?? config?.pause_date ?? config?.end_date;
  const cutoffText = cutoff instanceof Date ? cutoff.toISOString().slice(0, 10) : cutoff == null ? null : String(cutoff).slice(0, 10);
  if (cutoffText && input.date > cutoffText) return fail('该日期的标签已暂停或结束，不可登记');
  return { ...scope, category };
}
export type Ledger37CalendarRecord = {
  id: number; amount: string; type: string; description: string | null; stock_codes: string | null;
  reimbursement_status: string; pending_type: string | null; aj_status: string | null;
  createdBy: number; images: string | string[] | null; imageUrl: string | null; updatedAt: Date | string | null;
};
async function numberRows(connection: any, input: z.infer<typeof calendarNumberSchema>) {
  // Read metadata solely to reject special flows; never include it in the response.
  const [rows] = await connection.execute(`SELECT id, amount, type, description, reimbursement_status, createdBy, images, imageUrl, updatedAt,
    pending_type, aj_status, stock_codes FROM ledger_records WHERE ledgerId = 37 AND categoryId = ?
    AND recordDate = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 2`, [input.categoryId, input.date]);
  if (rows.length > 1) throw new TRPCError({ code: 'CONFLICT', message: '该日标签存在多条或特殊账务记录，请所有者先核对' });
  const record = rows[0];
  if (record) {
    const note = record.description == null ? '' : decryptValue(String(record.description));
    if (record.type !== 'expense' || record.reimbursement_status !== 'none' || record.pending_type != null
      || record.aj_status != null || (record.stock_codes != null && !['', '[]', 'null'].includes(String(record.stock_codes)))
      || /^(?:enc:v1:)|capital[_-]|dividend|withdraw|deposit|transfer|本金|提现|入金|出金|分红/i.test(note)) {
      throw new TRPCError({ code: 'CONFLICT', message: '该日记录不是普通日历余额，不可通过数字入口读取或覆盖' });
    }
  }
  return rows as Ledger37CalendarRecord[];
}
/** Only server-side narrow entry handlers consume this access result; never expose its scope metadata. */
export async function getCalendarRecordAccess(ctx: Ledger37Actor, input: z.infer<typeof calendarNumberSchema>) {
  const parsed = calendarNumberSchema.parse(input);
  const scope = await categoryScope(ctx, parsed);
  const rows = await numberRows(scope.connection, parsed);
  return { ...scope, record: rows[0] ?? null };
}
export async function getCalendarNumberCategories(ctx: Ledger37Actor, raw: unknown): Promise<Array<{ categoryId: number; name: string }>> {
  calendarNumberCategoriesSchema.parse(raw);
  const scope = await recordScope(ctx);
  const [categories] = await scope.connection.execute(`SELECT id, ledgerId, name, parentId, isDefault,
    accounting_mode AS accountingMode, type FROM ledger_categories WHERE ledgerId = 37
    AND parentId IS NULL AND accounting_mode = 'manual_balance' ORDER BY sortOrder ASC, id ASC`);
  return categories.filter((category: any) => eligible(category, scope)).map((category: any) => ({ categoryId: Number(category.id), name: String(category.name) }));
}
export async function getCalendarNumber(ctx: Ledger37Actor, raw: unknown): Promise<{ amount: number | null; exists: boolean }> {
  const input = calendarNumberSchema.parse(raw);
  const scope = await categoryScope(ctx, input);
  const rows = await numberRows(scope.connection, input);
  const amount = rows.length ? Number(rows[0].amount) : null;
  if (amount !== null && !Number.isFinite(amount)) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '日历数字无效' });
  return { amount, exists: rows.length > 0 };
}
export async function saveCalendarNumber(ctx: Ledger37Actor, raw: unknown): Promise<{ success: true; amount: number; exists: true; overwritten: boolean }> {
  const input = saveCalendarNumberSchema.parse(raw);
  // Permission/category checks occur before even acquiring a lock. Recheck under the shared legacy lock.
  await categoryScope(ctx, input);
  return withDatabaseLock(`ledger37:${input.categoryId}:${input.date}`, async () => {
    const scope = await categoryScope(ctx, input);
    const rows = await numberRows(scope.connection, input);
    if (rows.length && !input.overwriteExisting) throw new TRPCError({ code: 'CONFLICT', message: '该日期的这个标签已经填写过，请选择取消或覆盖原记录' });
    if (rows.length) {
      // Preserve createdBy, timestamps, type, attachments, notes, status and all other metadata.
      const [result] = await scope.connection.execute(`UPDATE ledger_records SET amount = ?, updatedAt = NOW()
        WHERE id = ? AND ledgerId = 37 AND categoryId = ? AND recordDate = ? AND type = 'expense' AND deleted_at IS NULL
        AND reimbursement_status = 'none' AND pending_type IS NULL AND aj_status IS NULL
        AND BINARY description <=> BINARY ? AND BINARY stock_codes <=> BINARY ? AND amount = ?`,
      [input.amount.toFixed(2), rows[0].id, input.categoryId, input.date, rows[0].description, rows[0].stock_codes, rows[0].amount]);
      if (Number(result.affectedRows) !== 1) throw new TRPCError({ code: 'CONFLICT', message: '日历记录已变化，请刷新后重新确认' });
    } else {
      // Existing AA calendar balances are expense records. No transfer/approval/AJ/wallet side effects.
      await scope.connection.execute(`INSERT INTO ledger_records (ledgerId, type, amount, categoryId, recordDate, createdBy,
        description, imageUrl, images, stock_codes, reimbursement_status, pending_type, pending_include_stats)
        VALUES (37, 'expense', ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'none', NULL, NULL)`,
      [input.amount.toFixed(2), input.categoryId, input.date, ctx.user.id]);
    }
    return { success: true, amount: input.amount, exists: true, overwritten: rows.length > 0 };
  });
}

/** Existing member memo/alias UI may send its whole snapshot. Ignore byte-equivalent untouched values,
 * but permit only self-owned descriptive fields, never capital/ratios/visibility/margins/dates/AI flags. */
export async function prepareLedger37PersonalConfigPatch(ctx: Ledger37Actor, ledgerId: number, patch: Record<string, number | string>): Promise<Record<string, number | string>> {
  if (ledgerId !== 37) return patch;
  const scope = await getLedger37Access(ctx);
  if (scope.canManage) return patch;
  if (!realActor(ctx)) return fail('代看身份不能修改本人备注');
  const existing = balancesOf(scope.row.initialBalances);
  const [categories] = await scope.connection.execute(`SELECT name FROM ledger_categories
    WHERE ledgerId = 37 AND parentId IS NULL AND accounting_mode = 'manual_balance'`, []);
  const allowed = new Set<string>();
  for (const category of categories) {
    if (!readTagVisible(existing, String(category.name))) continue;
    for (const suffix of ['__note', '__alias', '__aliasTime']) allowed.add(String(category.name) + suffix);
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (Object.hasOwn(existing, key) && Object.is(existing[key], value)) continue;
    if (!allowed.has(key) || typeof value !== 'string' || value.length > (key.endsWith('__note') ? 2000 : 160)) return fail('37号成员只能修改本人备注或别名，不能修改金额及管理设置');
    result[key] = value;
  }
  return result;
}
