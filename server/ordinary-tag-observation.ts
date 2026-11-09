import { TRPCError } from '@trpc/server';
import { getDbConnection } from './db';
import { decryptValue, isEncrypted } from './encryption';
import {
  ORDINARY_TAG_OBSERVATION_LEDGER_ID,
  calculateOrdinaryTagObservationSummary,
  ordinaryObservationAllocationPatch,
  readOrdinaryTagObservationConfig,
  validateOrdinaryTagObservationConfig,
  type OrdinaryTagObservationConfig,
  type OrdinaryTagObservationOverview,
  type OrdinaryTagObservationRecord,
  type OrdinaryTagObservationSummary,
} from '../shared/ordinary-tag-observation';

type Connection = NonNullable<Awaited<ReturnType<typeof getDbConnection>>>;
type Member = {
  id: number;
  ledgerId: number;
  userId: number;
  role: string;
  memberType: string;
  initialBalances: string | null;
};
type Category = {
  id: number;
  ledgerId: number;
  name: string;
  parentId: number | null;
  isDefault: number;
  accountingMode: string;
};
type AdminInput = { ledgerId: number; categoryId: number; targetUserId: number; actorUserId: number };

function assertLedger(ledgerId: number): void {
  if (ledgerId !== ORDINARY_TAG_OBSERVATION_LEDGER_ID) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '普通标签观察仅适用于37号账本' });
  }
}
function assertUserId(userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new TRPCError({ code: 'UNAUTHORIZED', message: '缺少有效的真实用户身份' });
}
async function connection(): Promise<Connection> {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接不可用' });
  return conn;
}
async function selectRows<T>(conn: Connection, sql: string, values: Array<number | string>): Promise<T[]> {
  const [rows] = await conn.execute(sql, values);
  return rows as unknown as T[];
}
async function requireMember(conn: Connection, ledgerId: number, userId: number): Promise<Member> {
  assertUserId(userId);
  // 字段与schema一致；JOIN只验证真实用户及真实账本存在，不读取钱包/余额。
  const rows = await selectRows<Member>(conn,
    `SELECT m.id, m.ledgerId, m.userId, m.role, m.member_type AS memberType,
            m.initial_balances AS initialBalances
     FROM ledger_members m
     INNER JOIN users u ON u.id = m.userId
     INNER JOIN ledgers l ON l.id = m.ledgerId
     WHERE m.ledgerId = ? AND m.userId = ? LIMIT 1`, [ledgerId, userId]);
  const member = rows[0];
  if (!member || member.ledgerId !== ledgerId || member.userId !== userId || member.memberType !== 'real') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '目标必须是此账本的真实成员，不能是AI成员' });
  }
  return member;
}
function balancesOf(member: Member): Record<string, unknown> {
  if (member.initialBalances === null || member.initialBalances === '') return {};
  try {
    const value: unknown = JSON.parse(member.initialBalances);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('非对象');
    return value as Record<string, unknown>;
  } catch {
    // 不用空对象覆盖不可解析的真实字段；拒绝写入，也不放宽旧可见性策略。
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '成员初始设置格式异常，请先修复原始数据' });
  }
}
function isOrdinaryCategory(category: Category, ledgerId: number): boolean {
  return category.ledgerId === ledgerId && category.parentId === null
    && Number(category.isDefault) === 0 && category.accountingMode === 'manual_balance';
}
async function requireCategory(conn: Connection, ledgerId: number, categoryId: number): Promise<Category> {
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的标签ID' });
  const rows = await selectRows<Category>(conn,
    `SELECT id, ledgerId, name, parentId, isDefault, accounting_mode AS accountingMode
     FROM ledger_categories WHERE ledgerId = ? AND id = ? LIMIT 1`, [ledgerId, categoryId]);
  const category = rows[0];
  if (!category || category.id !== categoryId || !isOrdinaryCategory(category, ledgerId)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '目标必须是37号账本manual_balance普通顶级非默认标签' });
  }
  return category;
}
async function adminAccess(input: AdminInput) {
  assertLedger(input.ledgerId);
  assertUserId(input.actorUserId);
  assertUserId(input.targetUserId);
  const conn = await connection();
  // actorUserId必须由路由从ctx.realUser提供，不接受客户端覆盖或全局admin兜底。
  const actor = await requireMember(conn, input.ledgerId, input.actorUserId);
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅此账本真实owner/admin可维护观察配置' });
  }
  const target = input.targetUserId === input.actorUserId ? actor : await requireMember(conn, input.ledgerId, input.targetUserId);
  const category = await requireCategory(conn, input.ledgerId, input.categoryId);
  return { conn, target, category };
}
function checkedConfig(config: OrdinaryTagObservationConfig): OrdinaryTagObservationConfig {
  try { return validateOrdinaryTagObservationConfig(config); }
  catch (cause) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: cause instanceof Error ? cause.message : '无效观察配置' });
  }
}
/** 账本业务日期为北京时间；共享计算函数始终接收显式today。 */
function ledgerToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
async function rawRecords(conn: Connection, category: Category, cutoff: string): Promise<OrdinaryTagObservationRecord[]> {
  // 只取此账本、此顶级标签及其直接子分类的真实参考流水，不读其他成员配置。
  // 开始日前记录仅供计算函数提取最后一个真实余额基准；未来/删除记录在SQL及纯函数双重排除。
  const rows = await selectRows<OrdinaryTagObservationRecord>(conn,
    `SELECT r.ledgerId, ? AS categoryId, DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate, r.type, r.amount,
            CASE WHEN r.type = 'transfer' THEN r.description ELSE NULL END AS description,
            r.deleted_at AS deletedAt
     FROM ledger_records r
     INNER JOIN ledger_categories c ON c.id = r.categoryId AND c.ledgerId = r.ledgerId
     WHERE r.ledgerId = ? AND (c.id = ? OR c.parentId = ?)
       AND r.deleted_at IS NULL AND r.recordDate <= ?
     ORDER BY r.recordDate ASC, r.id ASC`, [category.id, category.ledgerId, category.id, category.id, cutoff]);
  return rows.map((row) => {
    const description = typeof row.description === 'string' ? decryptValue(row.description) : null;
    if (description && isEncrypted(description)) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '本金流水备注无法解密，不能生成不准确的观察结果' });
    }
    return { ...row, description };
  });
}
async function summaryFor(conn: Connection, category: Category, userId: number, config: OrdinaryTagObservationConfig): Promise<OrdinaryTagObservationSummary> {
  const today = ledgerToday();
  const base = { ledgerId: ORDINARY_TAG_OBSERVATION_LEDGER_ID, userId, categoryId: category.id, categoryName: category.name, config, today };
  // 非启用/未来/非法配置不读取行情，不补默认值。
  let valid = true;
  try { validateOrdinaryTagObservationConfig(config); } catch { valid = false; }
  const cutoff = config.pauseDate !== null && config.pauseDate <= today ? config.pauseDate : today;
  const records = !valid || !config.enabled || config.startDate > today ? [] : await rawRecords(conn, category, cutoff);
  return calculateOrdinaryTagObservationSummary({ ...base, records });
}

export async function adminGetOrdinaryTagObservationConfig(input: AdminInput): Promise<{ config: OrdinaryTagObservationConfig | null }> {
  const { target, category } = await adminAccess(input);
  return { config: readOrdinaryTagObservationConfig(balancesOf(target), category.name) };
}

export async function adminSetOrdinaryTagObservationConfig(
  input: AdminInput & { config: OrdinaryTagObservationConfig },
): Promise<{ success: true; config: OrdinaryTagObservationConfig }> {
  // 即使绕开前端和路由也在连接/鉴权之前拒绝预览写操作。
  if (process.env.DEV_BYPASS_AUTH === 'true' || process.env.PREVIEW_READONLY === 'true') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '开发绕过认证/只读预览禁止保存观察配置' });
  }
  const config = checkedConfig(input.config);
  const { conn, target, category } = await adminAccess(input);
  balancesOf(target);
  // 模式与真实份额在同一个原子UPDATE中保存，不能出现“已观察但仍计入实际”的中间状态。
  // 只允许专用观察键以及开启时的 __ratio/__targetAmount，保留本金、可见性、押金和历史。
  const entries = Object.entries(ordinaryObservationAllocationPatch(category.name, config));
  const values = entries.flatMap(([key, value]) => [`$.${JSON.stringify(key)}`, value]);
  const placeholders = entries.map(() => '?, ?').join(', ');
  const [result] = await conn.execute(
    `UPDATE ledger_members
     SET initial_balances = JSON_SET(COALESCE(NULLIF(initial_balances, ''), JSON_OBJECT()), ${placeholders})
     WHERE id = ? AND ledgerId = ? AND userId = ? AND member_type = 'real'
       AND (initial_balances IS NULL OR initial_balances = '' OR
            (JSON_VALID(initial_balances) AND JSON_TYPE(initial_balances) = 'OBJECT'))`,
    [...values, target.id, input.ledgerId, input.targetUserId]);
  if ((result as unknown as { affectedRows: number }).affectedRows !== 1) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '观察配置未保存，成员或原始设置已变化' });
  }
  return { success: true, config };
}

export async function getMyOrdinaryTagObservationOverview(input: {
  ledgerId: number;
  userId: number;
  viewAsUserId?: number;
}): Promise<OrdinaryTagObservationOverview> {
  assertLedger(input.ledgerId);
  assertUserId(input.userId);
  if (input.viewAsUserId !== undefined && input.viewAsUserId !== input.userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'viewAsUserId仅可等于当前有效用户，不能读取第三人观察' });
  }
  const conn = await connection();
  const member = await requireMember(conn, input.ledgerId, input.userId);
  const balances = balancesOf(member);
  const categories = await selectRows<Category>(conn,
    `SELECT id, ledgerId, name, parentId, isDefault, accounting_mode AS accountingMode
     FROM ledger_categories
     WHERE ledgerId = ? AND parentId IS NULL AND isDefault = 0 AND accounting_mode = 'manual_balance'
     ORDER BY sortOrder ASC, id ASC`, [input.ledgerId]);
  const observations: OrdinaryTagObservationSummary[] = [];
  for (const category of categories) {
    if (!isOrdinaryCategory(category, input.ledgerId)) continue;
    // 自己的enabled配置是独立观察授权，不扩大真实标签可见列表/详情权限。
    // 不能以真实__visible/是否真实参与阻断管理员明确开启的试用观察。
    const config = readOrdinaryTagObservationConfig(balances, category.name);
    if (!config?.enabled) continue;
    observations.push(await summaryFor(conn, category, member.userId, config));
  }
  // 不返回balances、原始记录/备注或其他用户观察。
  return { userId: member.userId, observations };
}

/** 仅沙箱GET预览用；不得在生产routers注册，显式配置不保存、不转换真实参与。 */
export async function getOrdinaryTagObservationPreviewSummary(
  input: AdminInput & { config: OrdinaryTagObservationConfig },
): Promise<OrdinaryTagObservationSummary> {
  if (process.env.PREVIEW_READONLY !== 'true') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '普通标签试填预览仅允许在只读预览环境使用' });
  }
  const config = checkedConfig(input.config);
  const { conn, target, category } = await adminAccess(input);
  return summaryFor(conn, category, target.userId, config);
}
