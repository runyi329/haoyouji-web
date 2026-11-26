import { TRPCError } from '@trpc/server';
import { readUserTagDownsideCategoryOverrides } from './user-tag-downside-overrides';

const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
async function rows(conn: any, sql: string, params: number[]): Promise<any[]> {
  const [result] = await conn.execute(sql, params);
  if (!Array.isArray(result)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '用户强平配置锁内复核读取异常' });
  return result;
}
/** Internal only: caller owns the already-open exclusive financial transaction.
 * Ledger → category → real member locks match override saves. This is NOT a stock PnL calculator:
 * it rejects a pre-lock candidate if this user's mode changed, rather than paying stale counted/raw PnL.
 * No DDL, INSERT, wallet operation, network, scanner, cache, or transaction lifetime ownership.
 */
export async function assertUserTagOverridePaymentVersion(conn: any, input: {
  ledgerId: 37; categoryId: number; targetUserId: number; actorUserId: number; expectedVersion: number;
}): Promise<void> {
  if (input.ledgerId !== 37 || ![input.categoryId, input.targetUserId, input.actorUserId].every(positiveId)
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !conn?.execute) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '用户强平配置候选范围或版本无效，请刷新后重试' });
  }
  const ledgers = await rows(conn, 'SELECT id,ownerId FROM ledgers WHERE id=? FOR UPDATE', [37]);
  if (ledgers.length !== 1 || Number(ledgers[0].id) !== 37 || Number(ledgers[0].ownerId) !== input.actorUserId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅37号账本实际所有者可核验资金候选' });
  }
  const categories = await rows(conn, `SELECT id,ledgerId,parentId,isDefault,accounting_mode AS accountingMode
    FROM ledger_categories WHERE ledgerId=? AND id=? FOR UPDATE`, [37, input.categoryId]);
  if (categories.length !== 1 || Number(categories[0].id) !== input.categoryId || Number(categories[0].ledgerId) !== 37
    || categories[0].parentId !== null || Number(categories[0].isDefault) !== 0
    || !['stock_portfolio', 'manual_balance'].includes(categories[0].accountingMode)) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '结算标签已变化，请刷新后重试' });
  }
  const members = await rows(conn, `SELECT m.id,m.ledgerId,m.userId,m.member_type AS memberType,u.id AS realUserId
    FROM ledger_members m INNER JOIN users u ON u.id=m.userId
    WHERE m.ledgerId=? AND m.userId=? AND m.member_type='real' FOR UPDATE`, [37, input.targetUserId]);
  if (members.length !== 1 || Number(members[0].ledgerId) !== 37 || Number(members[0].userId) !== input.targetUserId
    || Number(members[0].realUserId) !== input.targetUserId || members[0].memberType !== 'real') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '目标用户真实成员范围已变化，请刷新后重试' });
  }
  const versions = await readUserTagDownsideCategoryOverrides(conn, 37, input.targetUserId, input.categoryId);
  const version = versions.reduce((latest, row) => Math.max(latest, row.version), 0);
  if (version !== input.expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: '该用户的强平控制在候选计算后已变化，请刷新后重新结算' });
}
