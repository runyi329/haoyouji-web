import { getDbConnection, getDbTransactionConnection } from './db';
import { readTagVisible } from '../shared/tag-visibility';
import {
  LEDGER37_AI_DISPLAY_KEY,
  type Ledger37PresentationContext, type Ledger37AiOverview,
  type Ledger37AiProject, type Ledger37AiDisplayResult,
  type Ledger37AiViewer,
} from '../shared/ledger37-ai-presentation';
import { replaceTopLevelJsonValue } from './r1-lossless-json';
import { readR1RecordedMargins } from './r1-stock-presentation';

export type Ledger37PresentationInput = {
  ledgerId: 37; userId: number; systemRole?: string; isViewingAs?: boolean;
};
export function readLedger37Balances(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === '') return {};
  if (typeof raw !== 'string') throw new Error('成员初始设置必须是JSON对象文本');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('成员初始设置JSON损坏，请先修复原始数据'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('成员初始设置必须是JSON对象');
  // 扫描原文发现包括转义拼写在内的重复全局键；不采用替换结果、更不迁移旧tag键。
  replaceTopLevelJsonValue(raw, LEDGER37_AI_DISPLAY_KEY, 0);
  return parsed as Record<string, unknown>;
}
export function readLedger37AiEnabled(balances: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(balances, LEDGER37_AI_DISPLAY_KEY)) return false;
  const value = balances[LEDGER37_AI_DISPLAY_KEY];
  if (value === 0) return false;
  if (value === 1) return true;
  throw new Error('AI展示开关必须是数字0或1');
}
function validateInput(input: Ledger37PresentationInput) {
  if (input.ledgerId !== 37) throw new Error('AI展示仅适用于37号账本');
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) throw new Error('成员ID无效');
}
export function isLedger37AiSystemAdmin(input: Ledger37PresentationInput): boolean {
  return !input.isViewingAs && (input.systemRole === 'admin' || input.systemRole === 'super_admin' || input.systemRole === 'systemadmin');
}
/** 只投影经成员JOIN取得的目标身份；缺档不回退到登录管理员或其他用户。 */
function readLedger37AiViewer(row: Record<string, unknown>, userId: number): Ledger37AiViewer | null {
  if (row.viewer_user_id == null) return null;
  if (row.viewer_user_id !== userId) throw new Error('AI展示用户身份不匹配');
  return {
    userId: row.viewer_user_id,
    username: typeof row.viewer_username === 'string' ? row.viewer_username : null,
    nickname: typeof row.viewer_nickname === 'string' ? row.viewer_nickname : null,
    avatar: typeof row.viewer_avatar === 'string' ? row.viewer_avatar : null,
  };
}
export async function readLedger37PresentationState(input: Ledger37PresentationInput, connection?: any) {
  validateInput(input);
  const conn = connection ?? await getDbConnection();
  if (!conn) throw new Error('数据库连接不可用');
  const [rows] = await conn.execute(
    `SELECT l.id AS ledger_id, m.userId AS member_user_id, m.role AS member_role,
            m.initial_balances AS initialBalances, u.id AS viewer_user_id,
            u.username AS viewer_username, u.name AS viewer_nickname, u.avatar AS viewer_avatar
     FROM ledgers l LEFT JOIN ledger_members m ON m.ledgerId=l.id AND m.userId=?
     LEFT JOIN users u ON u.id=m.userId
     WHERE l.id=? LIMIT 1`, [input.userId, 37]);
  if (rows.length !== 1 || Number(rows[0].ledger_id) !== 37) throw new Error('账本不存在');
  const row = rows[0], isMember = row.member_user_id != null;
  if (!isMember && !isLedger37AiSystemAdmin(input)) throw new Error('您不是此账本的成员');
  const viewer = readLedger37AiViewer(row, input.userId);
  const balances = isMember ? readLedger37Balances(row.initialBalances) : {};
  const context: Ledger37PresentationContext = {
    ledgerId: 37, viewerUserId: input.userId,
    canManage: !input.isViewingAs && (isLedger37AiSystemAdmin(input) || row.member_role === 'owner' || row.member_role === 'admin'),
    aiEnabled: readLedger37AiEnabled(balances),
    viewer: isMember ? viewer : null,
    isViewingAs: input.isViewingAs === true,
  };
  return { context, balances, isMember, memberRole: row.member_role as string | undefined };
}
export async function getLedger37PresentationContext(input: Ledger37PresentationInput): Promise<Ledger37PresentationContext> {
  return (await readLedger37PresentationState(input)).context;
}
/** 唯一写入口：ledger→members锁；只替换全局key，文本兄弟字段及updatedAt保持原样。 */
export async function setLedger37AiDisplay(input: Ledger37PresentationInput & { targetUserId: number; enabled: boolean }): Promise<Ledger37AiDisplayResult> {
  validateInput(input);
  if (input.isViewingAs) throw new Error('代看模式禁止修改AI展示开关');
  if (process.env.PREVIEW_READONLY === 'true' || process.env.DEV_BYPASS_AUTH === 'true') throw new Error('只读预览禁止修改AI展示开关');
  if (!Number.isSafeInteger(input.targetUserId) || input.targetUserId <= 0 || typeof input.enabled !== 'boolean') throw new Error('AI展示设置无效');
  const conn = await getDbTransactionConnection();
  if (!conn) throw new Error('数据库连接不可用');
  try {
    await conn.beginTransaction();
    const [ledgers] = await conn.execute('SELECT id FROM ledgers WHERE id = ? FOR UPDATE', [37]);
    if ((ledgers as any[]).length !== 1) throw new Error('账本不存在');
    const [members] = await conn.execute(
      `SELECT id, userId, role, initial_balances FROM ledger_members
       WHERE ledgerId = ? AND userId IN (?, ?) ORDER BY userId FOR UPDATE`, [37, input.userId, input.targetUserId]);
    const actors = (members as any[]).filter(row => Number(row.userId) === input.userId);
    const targets = (members as any[]).filter(row => Number(row.userId) === input.targetUserId);
    if (actors.length > 1 || targets.length > 1) throw new Error('成员记录重复');
    const actor = actors[0], target = targets[0];
    if (!isLedger37AiSystemAdmin(input) && actor?.role !== 'owner' && actor?.role !== 'admin') throw new Error('仅37号账本管理员可以修改AI展示开关');
    if (!target) throw new Error('目标用户不是此账本成员');
    if (actor) readLedger37AiEnabled(readLedger37Balances(actor.initial_balances));
    const balances = readLedger37Balances(target.initial_balances);
    readLedger37AiEnabled(balances);
    const value = input.enabled ? 1 : 0;
    if (!Object.prototype.hasOwnProperty.call(balances, LEDGER37_AI_DISPLAY_KEY) || balances[LEDGER37_AI_DISPLAY_KEY] !== value) {
      const [result] = await conn.execute(
        `UPDATE ledger_members SET initial_balances = ?, updatedAt = updatedAt
         WHERE id = ? AND ledgerId = ? AND userId = ? AND BINARY initial_balances <=> BINARY ?`,
        [replaceTopLevelJsonValue(target.initial_balances, LEDGER37_AI_DISPLAY_KEY, value), target.id, 37, input.targetUserId, target.initial_balances]);
      if ((result as { affectedRows: number }).affectedRows !== 1) throw new Error('AI展示开关未保存，成员记录已变化');
    }
    await conn.commit();
    return { success: true, aiEnabled: input.enabled };
  } catch (error) {
    try { await conn.rollback(); } catch (rollbackError) { throw new AggregateError([error, rollbackError], 'AI展示保存及回滚失败'); }
    throw error;
  } finally {
    if ('release' in conn && typeof conn.release === 'function') conn.release();
  }
}
function nullableAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function configDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
/** 仅SELECT本人已实收分配与本人登记本金；未领取浮盈没有可靠来源，禁止补零或套股票算法。 */
async function getMyOrdinaryProjects(input: Ledger37PresentationInput, state: Awaited<ReturnType<typeof readLedger37PresentationState>>, conn: any): Promise<Ledger37AiProject[]> {
  const [categories] = await conn.execute(
    `SELECT c.id, c.name, c.accounting_mode, c.isDefault FROM ledger_categories c
     INNER JOIN ledger_members m ON m.ledgerId=c.ledgerId AND m.userId=?
     WHERE c.ledgerId=? AND c.parentId IS NULL AND c.accounting_mode='manual_balance'
       AND c.isDefault=0 ORDER BY c.id`, [input.userId, 37]);
  const [payments] = await conn.execute(
    `SELECT tag_name, SUM(amount) AS total FROM dividend_records
     WHERE ledger_id=? AND user_id=? GROUP BY tag_name`, [37, input.userId]);
  const totals = new Map<string, number | null>();
  for (const row of payments as any[]) totals.set(String(row.tag_name), nullableAmount(row.total));
  const projects: Ledger37AiProject[] = [];
  for (const category of categories as any[]) {
    const categoryId = Number(category.id), name = String(category.name);
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new Error('标签无效');
    if (state.memberRole !== 'owner' && !readTagVisible(state.balances, name)) continue;
    const margins = await readR1RecordedMargins(conn, state.balances, name, input.userId);
    projects.push({ categoryId, displayName: `参与项目${categoryId}`, kind: 'ordinary',
      summary: null, receivedDividends: totals.has(name) ? totals.get(name)! : 0,
      recordedMargins: margins, startDate: configDate(state.balances[`${name}__startDate`]) });
  }
  return projects;
}
export async function getMyLedger37AiOverview(input: Ledger37PresentationInput): Promise<Ledger37AiOverview> {
  const state = await readLedger37PresentationState(input);
  if (!state.isMember) throw new Error('您不是此账本的成员');
  if (!state.context.aiEnabled && !state.context.canManage) throw new Error('账本AI展示尚未开启');
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接不可用');
  const { getMyLedger37SafeStockDirectory } = await import('./ledger-stock-portfolio');
  const stocks = await getMyLedger37SafeStockDirectory(input);
  const ordinary = await getMyOrdinaryProjects(input, state, conn);
  return { viewerUserId: input.userId, aiEnabled: state.context.aiEnabled,
    projects: stocks.concat(ordinary).sort((a, b) => a.categoryId - b.categoryId) };
}
