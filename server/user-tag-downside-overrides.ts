import { TRPCError } from '@trpc/server';
import { assertUserTagDownsideOverride, assertUserTagDownsideOverrides, type UserTagDownsideOverride } from '../shared/user-tag-downside-override';

export const USER_TAG_DOWNSIDE_OVERRIDES_DDL = `CREATE TABLE IF NOT EXISTS ledger_user_tag_downside_overrides (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id INT NOT NULL, category_id INT NOT NULL,
  target_user_id INT NOT NULL, actor_user_id INT NOT NULL,
  version BIGINT NOT NULL, mode ENUM('follow_tag','exempt') NOT NULL,
  created_at DATETIME(3) NOT NULL COMMENT 'UTC server audit timestamp; not an effective date',
  UNIQUE KEY uk_user_tag_downside_version (ledger_id,category_id,target_user_id,version),
  INDEX idx_user_tag_downside_target (ledger_id,target_user_id,category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
const COLUMNS = `ledger_id,category_id,target_user_id,actor_user_id,version,mode,
  DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at`;
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const missingTable = (error: any): boolean => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
function invalid(message: string): never { throw new TRPCError({ code: 'PRECONDITION_FAILED', message }); }
function conflict(): never { throw new TRPCError({ code: 'CONFLICT', message: '用户标签强平控制版本冲突，请刷新后重试' }); }
function integerOf(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) invalid('用户标签强平控制数字损坏');
  const number = Number(value);
  if (!positiveId(number)) invalid('用户标签强平控制数字损坏');
  return number;
}
function decode(row: any): UserTagDownsideOverride {
  if (!row || typeof row !== 'object') invalid('用户标签强平控制读取结果损坏');
  const ledgerId = integerOf(row.ledger_id);
  if (ledgerId !== 37) invalid('用户标签强平控制跨账本范围损坏');
  const override: UserTagDownsideOverride = { ledgerId: 37,
    categoryId: integerOf(row.category_id), targetUserId: integerOf(row.target_user_id),
    actorUserId: integerOf(row.actor_user_id), version: integerOf(row.version),
    mode: row.mode, createdAt: row.created_at };
  try { assertUserTagDownsideOverride(override); }
  catch (error) { invalid((error as Error).message); }
  return override;
}
async function rows(conn: any, sql: string, params: unknown[]): Promise<any[]> {
  const [result] = await conn.execute(sql, params);
  if (!Array.isArray(result)) invalid('用户标签强平控制数据库读取结果异常');
  return result;
}
function decodeScope(found: any[], ledgerId: number, targetUserId?: number, categoryId?: number): UserTagDownsideOverride[] {
  const result = found.map(row => {
    const override = decode(row);
    if (override.ledgerId !== ledgerId || (targetUserId !== undefined && override.targetUserId !== targetUserId)
      || (categoryId !== undefined && override.categoryId !== categoryId)) invalid('用户标签强平控制查询范围损坏');
    return override;
  });
  try { assertUserTagDownsideOverrides(result); }
  catch (error) { invalid((error as Error).message); }
  return result;
}
async function readScope(conn: any, ledgerId: number, targetUserId?: number, categoryId?: number): Promise<UserTagDownsideOverride[]> {
  if (ledgerId !== 37 || (targetUserId !== undefined && !positiveId(targetUserId))
    || (categoryId !== undefined && !positiveId(categoryId))) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '用户标签强平控制仅支持37号账本有效查询范围' });
  }
  const clauses = ['ledger_id=?'];
  const params: unknown[] = [ledgerId];
  if (targetUserId !== undefined) { clauses.push('target_user_id=?'); params.push(targetUserId); }
  if (categoryId !== undefined) { clauses.push('category_id=?'); params.push(categoryId); }
  let found: any[];
  // Only the SELECT itself has missing-table compatibility; corrupt decoded data always throws.
  try { found = await rows(conn, `SELECT ${COLUMNS} FROM ledger_user_tag_downside_overrides WHERE ${clauses.join(' AND ')} ORDER BY target_user_id,category_id,version`, params); }
  catch (error) { if (missingTable(error)) return []; throw error; }
  return decodeScope(found, ledgerId, targetUserId, categoryId);
}
/** One SELECT, all saved versions for this ledger or target. No dates, DDL, cache, transaction or writes. */
export async function readUserTagDownsideOverrides(conn: any, ledgerId: number, targetUserId?: number): Promise<UserTagDownsideOverride[]> {
  return readScope(conn, ledgerId, targetUserId);
}
/** Exact target + category scope for CAS/config reads, with the same fail-closed decoding. */
export async function readUserTagDownsideCategoryOverrides(conn: any, ledgerId: number, targetUserId: number, categoryId: number): Promise<UserTagDownsideOverride[]> {
  return readScope(conn, ledgerId, targetUserId, categoryId);
}
export type SetUserTagDownsideOverrideInput = {
  ledgerId: number; categoryId: number; targetUserId: number;
  /** Real authenticated actor only. systemRole NEVER grants owner permission. */
  userId: number; systemRole?: string; isViewingAs?: boolean;
  mode: 'follow_tag' | 'exempt'; expectedVersion: number;
};
function checkInput(input: SetUserTagDownsideOverrideInput): void {
  // MUST run before importing DB or acquiring any connection, including actual-owner calls.
  if (process.env.PREVIEW_READONLY === 'true' || process.env.FAST_PREVIEW === 'true' || process.env.DEV_BYPASS_AUTH === 'true') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '只读预览或DEV身份禁止保存用户标签强平控制' });
  }
  if (input?.isViewingAs) throw new TRPCError({ code: 'FORBIDDEN', message: '代看身份禁止保存用户标签强平控制' });
  const allowed = new Set(['ledgerId', 'categoryId', 'targetUserId', 'userId', 'systemRole', 'isViewingAs', 'mode', 'expectedVersion']);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || 'actorUserId' in input || 'viewAsUserId' in input
    || Reflect.ownKeys(input).some(key => typeof key !== 'string' || !allowed.has(key))
    || input.ledgerId !== 37 || ![input.categoryId, input.targetUserId, input.userId].every(positiveId)
    || (input.mode !== 'follow_tag' && input.mode !== 'exempt')
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion >= Number.MAX_SAFE_INTEGER
    || (input.systemRole !== undefined && typeof input.systemRole !== 'string')
    || (input.isViewingAs !== undefined && typeof input.isViewingAs !== 'boolean')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '用户标签强平控制输入无效，仅支持37号账本真实用户、有效标签、两种模式及非负安全版本' });
  }
}
const sqlInteger = (value: unknown): number | null => {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
};
function checkOwner(found: any[], input: SetUserTagDownsideOverrideInput): void {
  if (found.length !== 1 || sqlInteger(found[0]?.id) !== 37 || sqlInteger(found[0]?.ownerId) !== input.userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅37号账本实际所有者本人可以维护用户标签强平控制，普通管理员无权' });
  }
}
function checkCategory(found: any[], input: SetUserTagDownsideOverrideInput): void {
  const category = found[0];
  if (found.length !== 1 || sqlInteger(category?.id) !== input.categoryId || sqlInteger(category?.ledgerId) !== 37
    || category.parentId !== null || sqlInteger(category.isDefault) !== 0
    || !['manual_balance', 'stock_portfolio'].includes(category.accountingMode)
    || typeof category.name !== 'string' || !category.name.trim()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '目标必须是37号账本有效manual_balance或stock_portfolio顶级非默认标签' });
  }
}
function checkTarget(found: any[], input: SetUserTagDownsideOverrideInput): void {
  const member = found[0];
  if (found.length !== 1 || !positiveId(sqlInteger(member?.id)) || sqlInteger(member?.ledgerId) !== 37
    || sqlInteger(member?.userId) !== input.targetUserId || sqlInteger(member?.realUserId) !== input.targetUserId
    || member?.memberType !== 'real') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '目标用户必须是37号账本关联真实users记录的real成员，AI或外账本成员无效' });
  }
}
const CATEGORY_SQL = `SELECT id,ledgerId,name,parentId,isDefault,accounting_mode AS accountingMode
  FROM ledger_categories WHERE id=? AND ledgerId=?`;
const TARGET_SQL = `SELECT m.id,m.ledgerId,m.userId,m.member_type AS memberType,u.id AS realUserId
  FROM ledger_members m INNER JOIN users u ON u.id = m.userId
  WHERE m.ledgerId=? AND m.userId=? AND m.member_type = 'real'`;
/** Only called on an explicit authenticated owner's save action; NEVER an automatic exemption/backfill.
 * Owns an exclusive connection. Owner FIRST preflight → category → real target → CAS, then lazy DDL
 * OUTSIDE transaction. Lock order ledger → category → target member → latest version. INSERT ONLY.
 * Does not touch principal, member JSON, wallet, settlement, quote, epoch or permission data.
 */
export async function setUserTagDownsideOverride(input: SetUserTagDownsideOverrideInput): Promise<{ success: true; override: UserTagDownsideOverride }> {
  checkInput(input);
  const { getDbTransactionConnection } = await import('./db');
  const connection: any = await getDbTransactionConnection();
  if (!connection) invalid('数据库独占事务连接不可用');
  let began = false;
  try {
    checkOwner(await rows(connection, 'SELECT id,ownerId FROM ledgers WHERE id=?', [37]), input);
    checkCategory(await rows(connection, CATEGORY_SQL, [input.categoryId, 37]), input);
    checkTarget(await rows(connection, TARGET_SQL, [37, input.targetUserId]), input);
    const before = await readUserTagDownsideCategoryOverrides(connection, 37, input.targetUserId, input.categoryId);
    const beforeVersion = before.reduce((latest, override) => Math.max(latest, override.version), 0);
    if (beforeVersion !== input.expectedVersion) conflict();
    await connection.execute(USER_TAG_DOWNSIDE_OVERRIDES_DDL);
    await connection.beginTransaction(); began = true;
    checkOwner(await rows(connection, 'SELECT id,ownerId FROM ledgers WHERE id=? FOR UPDATE', [37]), input);
    checkCategory(await rows(connection, `${CATEGORY_SQL} FOR UPDATE`, [input.categoryId, 37]), input);
    checkTarget(await rows(connection, `${TARGET_SQL} FOR UPDATE`, [37, input.targetUserId]), input);
    const latest = await rows(connection, `SELECT ${COLUMNS} FROM ledger_user_tag_downside_overrides
      WHERE ledger_id=? AND target_user_id=? AND category_id=? ORDER BY version DESC LIMIT 1 FOR UPDATE`, [37, input.targetUserId, input.categoryId]);
    if (latest.length > 1) invalid('锁后用户标签强平控制版本结果异常');
    const previous = decodeScope(latest, 37, input.targetUserId, input.categoryId)[0];
    if ((previous?.version ?? 0) !== input.expectedVersion) conflict();
    const override: UserTagDownsideOverride = { ledgerId: 37, categoryId: input.categoryId,
      targetUserId: input.targetUserId, actorUserId: input.userId, version: input.expectedVersion + 1,
      mode: input.mode, createdAt: new Date().toISOString() };
    assertUserTagDownsideOverride(override);
    const [inserted] = await connection.execute(`INSERT INTO ledger_user_tag_downside_overrides
      (ledger_id,category_id,target_user_id,actor_user_id,version,mode,created_at) VALUES (?,?,?,?,?,?,?)`,
    [37, override.categoryId, override.targetUserId, override.actorUserId, override.version,
      override.mode, override.createdAt.slice(0, 23).replace('T', ' ')]);
    if (inserted?.affectedRows !== 1) invalid('用户标签强平控制保存失败');
    await connection.commit(); began = false;
    return { success: true, override };
  } catch (error: any) {
    if (began) {
      try { await connection.rollback(); }
      catch (rollbackError) { throw new AggregateError([error, rollbackError], '用户标签强平控制保存失败，且事务回滚失败'); }
    }
    if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) conflict();
    throw error;
  } finally {
    if (typeof connection.release === 'function') await connection.release();
    else if (typeof connection.end === 'function') await connection.end();
  }
}
