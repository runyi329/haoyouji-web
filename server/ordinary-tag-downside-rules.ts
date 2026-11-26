import { TRPCError } from '@trpc/server';
import { validateOrdinaryTagDownsideSettings, validateOrdinaryTagDownsideStartDate, type OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';

export const ORDINARY_TAG_DOWNSIDE_RULES_DDL = `CREATE TABLE IF NOT EXISTS ledger_ordinary_tag_downside_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id INT NOT NULL, category_id INT NOT NULL, user_id INT NOT NULL,
  version INT NOT NULL, enabled BOOLEAN NOT NULL,
  threshold_amount DECIMAL(30,12) NOT NULL, downside_percent DECIMAL(12,8) NOT NULL,
  start_date DATE NOT NULL,
  created_at DATETIME(3) NOT NULL COMMENT 'UTC server audit timestamp',
  UNIQUE KEY uk_ordinary_tag_downside_version (ledger_id,category_id,version),
  INDEX idx_ordinary_tag_downside_effective (ledger_id,category_id,start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
const COLUMNS = `ledger_id,category_id,user_id,version,enabled,threshold_amount,downside_percent,
  DATE_FORMAT(start_date,'%Y-%m-%d') AS start_date,
  DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at`;
const positiveId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
const missingTable = (error: any) => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
function invalid(message: string): never { throw new TRPCError({ code: 'PRECONDITION_FAILED', message }); }
function conflict(): never { throw new TRPCError({ code: 'CONFLICT', message: '普通标签欠保证金版本冲突，请刷新后重试' }); }
function numberOf(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === ''
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value))) invalid('普通标签欠保证金规则数字损坏');
  const result = Number(value);
  if (!Number.isFinite(result)) invalid('普通标签欠保证金规则数字损坏');
  return result;
}
function decode(row: any): OrdinaryTagDownsideRule {
  const ledgerId = numberOf(row.ledger_id), categoryId = numberOf(row.category_id), userId = numberOf(row.user_id), version = numberOf(row.version);
  if (ledgerId !== 37 || ![categoryId, userId, version].every(positiveId)) invalid('普通标签欠保证金规则范围或版本损坏');
  const enabledValue = numberOf(row.enabled);
  if (enabledValue !== 0 && enabledValue !== 1) invalid('普通标签欠保证金开关损坏');
  const thresholdAmount = numberOf(row.threshold_amount), downsidePercent = numberOf(row.downside_percent);
  try { validateOrdinaryTagDownsideSettings(thresholdAmount, downsidePercent); validateOrdinaryTagDownsideStartDate(row.start_date); }
  catch { invalid('普通标签欠保证金规则金额、比例或日期损坏'); }
  // SQL DATE_FORMAT returns exact business date and explicit UTC audit string; no local timezone conversion.
  if (typeof row.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(row.created_at)
    || !Number.isFinite(Date.parse(row.created_at))) invalid('普通标签欠保证金规则审计时间损坏');
  return { ledgerId: 37, categoryId, userId, version, enabled: enabledValue === 1,
    thresholdAmount, downsidePercent, startDate: row.start_date, createdAt: row.created_at };
}
async function rows(connection: any, sql: string, params: unknown[]): Promise<any[]> {
  const [result] = await connection.execute(sql, params);
  if (!Array.isArray(result)) invalid('数据库读取结果异常');
  return result;
}
/** SELECT-only whole-ledger batch, all saved versions (including future/disabled), no DDL/cache. */
export async function readAllOrdinaryTagDownsideRules(conn: any, ledgerId: number): Promise<Map<number, OrdinaryTagDownsideRule[]>> {
  const result = new Map<number, OrdinaryTagDownsideRule[]>();
  if (ledgerId !== 37) return result;
  try {
    const found = await rows(conn, `SELECT ${COLUMNS} FROM ledger_ordinary_tag_downside_rules WHERE ledger_id=? ORDER BY category_id,version`, [ledgerId]);
    for (const row of found) {
      const rule = decode(row);
      if (rule.ledgerId !== ledgerId) invalid('普通标签欠保证金规则跨账本');
      const bucket = result.get(rule.categoryId) ?? [];
      bucket.push(rule); result.set(rule.categoryId, bucket);
    }
    return result;
  } catch (error) { if (missingTable(error)) return new Map(); throw error; }
}
/** SELECT-only category read with bound ledger/category scope; never ensures tables or caches. */
export async function readOrdinaryTagDownsideRules(conn: any, ledgerId: number, categoryId: number): Promise<OrdinaryTagDownsideRule[]> {
  if (ledgerId !== 37 || !positiveId(categoryId)) return [];
  try {
    const found = await rows(conn, `SELECT ${COLUMNS} FROM ledger_ordinary_tag_downside_rules WHERE ledger_id=? AND category_id=? ORDER BY version`, [ledgerId, categoryId]);
    return found.map(row => {
      const rule = decode(row);
      if (rule.ledgerId !== ledgerId || rule.categoryId !== categoryId) invalid('普通标签欠保证金规则范围损坏');
      return rule;
    });
  } catch (error) { if (missingTable(error)) return []; throw error; }
}
export type SetOrdinaryTagDownsideRuleInput = {
  ledgerId: number; categoryId: number;
  /** 从认证上下文传入真实操作者；systemRole不授予owner权限。 */
  userId: number; systemRole?: string; isViewingAs?: boolean;
  enabled: boolean; thresholdAmount: number; downsidePercent: number; startDate: string; expectedVersion: number;
};
function checkInput(input: SetOrdinaryTagDownsideRuleInput): void {
  // MUST run before importing/acquiring any DB connection, even for an actual owner.
  if (process.env.PREVIEW_READONLY === 'true' || process.env.FAST_PREVIEW === 'true' || process.env.DEV_BYPASS_AUTH === 'true') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '只读预览或DEV身份禁止保存正式欠保证金规则' });
  }
  if (input.isViewingAs) throw new TRPCError({ code: 'FORBIDDEN', message: '代看身份禁止保存欠保证金规则' });
  if (input.ledgerId !== 37 || !positiveId(input.categoryId) || !positiveId(input.userId)) throw new TRPCError({ code: 'BAD_REQUEST', message: '仅支持37号账本有效普通标签及真实操作者' });
  if (typeof input.enabled !== 'boolean') throw new TRPCError({ code: 'BAD_REQUEST', message: '欠保证金开关必须是布尔值' });
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new TRPCError({ code: 'BAD_REQUEST', message: '欠保证金预期版本必须是非负整数' });
  try { validateOrdinaryTagDownsideSettings(input.thresholdAmount, input.downsidePercent); validateOrdinaryTagDownsideStartDate(input.startDate); }
  catch (error) { throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message }); }
}
function checkCategory(found: any[], input: SetOrdinaryTagDownsideRuleInput): void {
  const category = found[0];
  if (found.length !== 1 || Number(category?.id) !== input.categoryId || Number(category?.ledgerId) !== 37
    || category.parentId !== null || Number(category.isDefault) !== 0 || category.accountingMode !== 'manual_balance'
    || typeof category.name !== 'string' || !category.name.trim()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '目标必须是37号账本有效manual_balance普通顶级非默认标签' });
  }
}
function checkOwner(found: any[], input: SetOrdinaryTagDownsideRuleInput): void {
  if (found.length !== 1 || Number(found[0]?.id) !== 37 || Number(found[0]?.ownerId) !== input.userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅37号账本实际所有者可以维护欠保证金，普通admin无权' });
  }
}
const CATEGORY_SQL = `SELECT id,ledgerId,name,parentId,isDefault,accounting_mode AS accountingMode
  FROM ledger_categories WHERE id=? AND ledgerId=?`;
/** Owns one exclusive connection and transaction. Lazy DDL only AFTER real-owner + legal-category preflight.
 * DDL stays outside the transaction (MySQL implicit commit); ledger is the FIRST transaction lock,
 * then category and latest version CAS, matching existing ledger→category→member config writes.
 * No existing table writes, history/scanner/cache work.
 */
export async function setOrdinaryTagDownsideRule(input: SetOrdinaryTagDownsideRuleInput): Promise<{ success: true; rule: OrdinaryTagDownsideRule }> {
  checkInput(input);
  const { getDbTransactionConnection } = await import('./db');
  const connection: any = await getDbTransactionConnection();
  if (!connection) invalid('数据库独占事务连接不可用');
  let began = false;
  try {
    // Actual owner is verified from ledgers.ownerId, never membership/system admin/preview capability.
    checkOwner(await rows(connection, 'SELECT id,ownerId FROM ledgers WHERE id=?', [37]), input);
    checkCategory(await rows(connection, CATEGORY_SQL, [input.categoryId, 37]), input);
    // Before DDL, stale expectedVersion is already rejected; missing new table represents version 0.
    const before = await readOrdinaryTagDownsideRules(connection, 37, input.categoryId);
    const beforeVersion = before.reduce((latest, rule) => Math.max(latest, rule.version), 0);
    if (beforeVersion !== input.expectedVersion) conflict();
    await connection.execute(ORDINARY_TAG_DOWNSIDE_RULES_DDL);
    await connection.beginTransaction(); began = true;
    // Ledger FIRST avoids a reverse lock against existing ledger→category→member config writes.
    checkOwner(await rows(connection, 'SELECT id,ownerId FROM ledgers WHERE id=? FOR UPDATE', [37]), input);
    checkCategory(await rows(connection, `${CATEGORY_SQL} FOR UPDATE`, [input.categoryId, 37]), input);
    const latest = await rows(connection, `SELECT ${COLUMNS} FROM ledger_ordinary_tag_downside_rules
      WHERE ledger_id=? AND category_id=? ORDER BY version DESC LIMIT 1 FOR UPDATE`, [37, input.categoryId]);
    const previous = latest[0] ? decode(latest[0]) : null;
    if (latest.length > 1 || (previous && (previous.ledgerId !== 37 || previous.categoryId !== input.categoryId))) invalid('锁后欠保证金规则范围异常');
    if ((previous?.version ?? 0) !== input.expectedVersion) conflict();
    const version = input.expectedVersion + 1;
    if (!positiveId(version)) invalid('欠保证金版本超出安全整数范围');
    const rule: OrdinaryTagDownsideRule = { ledgerId: 37, categoryId: input.categoryId, userId: input.userId,
      version, enabled: input.enabled, thresholdAmount: input.thresholdAmount, downsidePercent: input.downsidePercent,
      startDate: input.startDate, createdAt: new Date().toISOString() };
    const [inserted] = await connection.execute(`INSERT INTO ledger_ordinary_tag_downside_rules
      (ledger_id,category_id,user_id,version,enabled,threshold_amount,downside_percent,start_date,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, [37, rule.categoryId, rule.userId, rule.version, rule.enabled ? 1 : 0,
      rule.thresholdAmount, rule.downsidePercent, rule.startDate, rule.createdAt.slice(0, 23).replace('T', ' ')]);
    if (inserted?.affectedRows !== 1) invalid('欠保证金规则保存失败');
    await connection.commit(); began = false;
    return { success: true, rule };
  } catch (error: any) {
    if (began) {
      try { await connection.rollback(); }
      catch (rollbackError) { throw new AggregateError([error, rollbackError], '欠保证金保存失败，且事务回滚失败'); }
    }
    if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) conflict();
    throw error;
  } finally {
    if (typeof connection.release === 'function') await connection.release();
    else if (typeof connection.end === 'function') await connection.end();
  }
}
