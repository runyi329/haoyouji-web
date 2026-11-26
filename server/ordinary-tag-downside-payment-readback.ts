import { decryptValue, isEncrypted } from './encryption';
import { readOrdinaryTagDownsideRules } from './ordinary-tag-downside-rules';
import { readUserTagDownsideOverrides } from './user-tag-downside-overrides';
import {
  buildOrdinaryTagDownsideValuation,
  type OrdinaryTagDownsideValuationRecord,
} from './ordinary-tag-downside-valuation';
import { validateOrdinaryTagDownsideStartDate } from '../shared/ordinary-tag-downside';

export type OrdinaryTagDownsidePaymentReadbackInput = {
  ledgerId: 37;
  /** Target real member, not the owner performing the authorized operation. */
  userId: number;
  /** Optional internal owner recheck; production routers pass the authenticated real actor. */
  actorUserId?: number;
  tagName: string;
  expectedCategoryId?: number;
  /** Explicit Beijing business date. */
  today: string;
};
export type OrdinaryTagDownsidePaymentReadback = {
  applicable: boolean;
  status: 'ready' | 'pending' | 'no_data';
  cumulativeReturn: number | null;
  ruleVersion?: number;
  categoryId?: number;
};

type Category = {
  id: number; ledgerId: number; name: string; parentId: number | null;
  isDefault: number; accountingMode: string;
};
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const notApplicable = (): OrdinaryTagDownsidePaymentReadback => ({ applicable: false, status: 'no_data', cumulativeReturn: null });
const pending = (categoryId?: number): OrdinaryTagDownsidePaymentReadback => ({
  applicable: true, status: 'pending', cumulativeReturn: null,
  ...(categoryId === undefined ? {} : { categoryId }),
});
async function rows<T>(conn: any, sql: string, params: Array<string | number>): Promise<T[]> {
  const [result] = await conn.execute(sql, params);
  if (!Array.isArray(result)) throw new Error('普通标签结算回读结果异常');
  return result as T[];
}
function balancesOf(raw: unknown): Record<string, unknown> | null {
  // Preserve actual numeric/string zero. SQL NULL / empty unconfigured text is not damaged JSON.
  if (raw === null || raw === '') return {};
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

/** Internal SELECT-only readback; NOT a public API or an authorization gate.
 * PRECONDITION: caller already began a transaction on this exclusive connection and verified
 * the real owner/action. Call before any consistent/snapshot SELECT in that transaction.
 * mysql2 has no portable public active-transaction probe; caller must enforce this contract.
 * Lock order is ledger -> category (even when no rule exists) -> target real member.
 * Rule creation/replacement also locks ledger -> category, so it cannot race this check;
 * this matches existing initial-balance/category writers and avoids lock-order inversion.
 * Caller alone owns transaction lifetime/release and any independently authorized settlement.
 * Complete root/direct-child history is read through today; the shared builder alone applies
 * personal pause/cutoff/version semantics and cash-flow-neutral PnL, without cents rounding.
 */
export async function readOrdinaryTagDownsidePaymentReturn(
  conn: any,
  input: OrdinaryTagDownsidePaymentReadbackInput,
): Promise<OrdinaryTagDownsidePaymentReadback> {
  if (input.ledgerId !== 37 || !positiveId(input.userId) || typeof input.tagName !== 'string' || !input.tagName.trim()
    || (input.actorUserId !== undefined && !positiveId(input.actorUserId))
    || (input.expectedCategoryId !== undefined && !positiveId(input.expectedCategoryId))) {
    throw new Error('普通标签结算回读范围无效');
  }
  validateOrdinaryTagDownsideStartDate(input.today);
  if (!conn || typeof conn.execute !== 'function') throw new Error('普通标签结算回读需要调用方的独占事务连接');

  const ledgers = await rows<{ id: number; ownerId: number }>(conn,
    'SELECT id, ownerId FROM ledgers WHERE id = ? FOR UPDATE', [37]);
  if (ledgers.length !== 1 || Number(ledgers[0]?.id) !== 37) return pending(input.expectedCategoryId);
  if (input.actorUserId !== undefined && Number(ledgers[0].ownerId) !== input.actorUserId) return pending(input.expectedCategoryId);

  const categories = await rows<Category>(conn,
    `SELECT id, ledgerId, name, parentId, isDefault, accounting_mode AS accountingMode
     FROM ledger_categories WHERE ledgerId = ? AND BINARY name = BINARY ?
       AND parentId IS NULL AND isDefault = 0 AND accounting_mode = 'manual_balance'
     ORDER BY id FOR UPDATE`, [37, input.tagName]);
  if (!categories.length) {
    if (input.expectedCategoryId === undefined) return notApplicable();
    // An expected id means the caller already resolved the category before locking. Distinguish
    // existing stock (outside this feature) from deleted/renamed/moved/invalidated ordinary tags.
    // ledger_categories has no deleted_at column: deletion is represented by a missing id.
    const expected = await rows<Category>(conn,
      `SELECT id, ledgerId, name, parentId, isDefault, accounting_mode AS accountingMode
       FROM ledger_categories WHERE ledgerId = ? AND id = ? FOR UPDATE`, [37, input.expectedCategoryId]);
    const stock = expected[0];
    if (expected.length === 1 && Number(stock.id) === input.expectedCategoryId && Number(stock.ledgerId) === 37
      && stock.name === input.tagName && stock.parentId === null && Number(stock.isDefault) === 0
      && stock.accountingMode === 'stock_portfolio') return notApplicable();
    return pending(input.expectedCategoryId);
  }
  const category = categories[0];
  // Defense in depth for drivers/mocks. Never reinterpret an invalid category as raw ready.
  if (categories.length !== 1 || !positiveId(Number(category.id)) || Number(category.ledgerId) !== 37
    || category.name !== input.tagName || category.parentId !== null || Number(category.isDefault) !== 0
    || (input.expectedCategoryId !== undefined && Number(category.id) !== input.expectedCategoryId)) {
    return pending(input.expectedCategoryId);
  }
  if (category.accountingMode === 'stock_portfolio') return notApplicable();
  const categoryId = Number(category.id);
  if (category.accountingMode !== 'manual_balance') return pending(categoryId);

  let rules;
  try { rules = await readOrdinaryTagDownsideRules(conn, 37, categoryId); }
  catch { return pending(categoryId); }
  // Store explicitly maps a missing rules table to []; never ensure/create it during payment.
  if (!rules.length) return notApplicable();
  if (rules.some(rule => rule.ledgerId !== 37 || rule.categoryId !== categoryId)) return pending(categoryId);

  const members = await rows<{
    id: number; ledgerId: number; userId: number; memberType: string; realUserId: number;
    initialBalances: string | null;
  }>(conn,
    `SELECT m.id, m.ledgerId, m.userId, m.member_type AS memberType,
            m.initial_balances AS initialBalances, u.id AS realUserId
     FROM ledger_members m INNER JOIN users u ON u.id = m.userId
     WHERE m.ledgerId = ? AND m.userId = ? AND m.member_type = 'real'
     ORDER BY m.id FOR UPDATE`, [37, input.userId]);
  const member = members[0];
  if (members.length !== 1 || !positiveId(Number(member?.id)) || Number(member.ledgerId) !== 37
    || Number(member.userId) !== input.userId || Number(member.realUserId) !== input.userId || member.memberType !== 'real') {
    return pending(categoryId);
  }
  const balances = balancesOf(member.initialBalances);
  if (balances === null) return pending(categoryId);

  // Writers share the ledger -> category -> target-member lock order. Read the validated
  // override only after those locks; caller has made no earlier consistent/snapshot SELECT.
  // A broken store must block payment, never silently grant raw or fall back to a snapshot.
  let userTagDownsideOverrides;
  try { userTagDownsideOverrides = await readUserTagDownsideOverrides(conn, 37, input.userId); }
  catch { return pending(categoryId); }

  // Current locking read, not the rules SELECT's repeatable-read snapshot. Lock all real
  // balances/flows against legacy record writers that do not participate in the ledger lock.
  const records = await rows<OrdinaryTagDownsideValuationRecord>(conn,
    `SELECT r.ledgerId, ? AS categoryId, DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate,
            r.type, r.amount, r.id AS recordId,
            DATE_FORMAT(r.createdAt, '%Y-%m-%d %H:%i:%s.%f') AS createdAt,
            CASE WHEN r.type = 'transfer' THEN r.description ELSE NULL END AS description,
            r.deleted_at AS deletedAt
     FROM ledger_records r
     INNER JOIN ledger_categories c ON c.id = r.categoryId AND c.ledgerId = r.ledgerId
     WHERE r.ledgerId = ? AND (c.id = ? OR c.parentId = ?)
       AND r.deleted_at IS NULL AND r.recordDate <= ?
     ORDER BY r.recordDate ASC, r.createdAt ASC, r.id ASC FOR UPDATE`, [categoryId, 37, categoryId, categoryId, input.today]);
  // Fail closed on unexpected scope instead of silently omitting potentially material evidence.
  if (records.some(row => Number(row.ledgerId) !== 37 || Number(row.categoryId) !== categoryId
    || row.deletedAt != null || row.deleted_at != null || typeof row.recordDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.recordDate) || row.recordDate > input.today)) return pending(categoryId);
  try {
    const decrypted = records.map(row => {
      if (row.type !== 'transfer') return { ...row, description: null };
      if (row.description != null && typeof row.description !== 'string') throw new Error('本金流水备注异常');
      const description = row.description == null ? null : decryptValue(row.description);
      if (description !== null && isEncrypted(description)) throw new Error('本金流水备注未解密');
      return { ...row, description };
    });
    const valuation = buildOrdinaryTagDownsideValuation({ ledgerId: 37, userId: input.userId,
      categoryId, categoryName: category.name, balances, records: decrypted, rules, userTagDownsideOverrides, today: input.today });
    if (valuation.categoryId !== categoryId || valuation.categoryName !== category.name) return pending(categoryId);
    if (valuation.status === 'pending') return pending(categoryId);
    if (valuation.status === 'no_data') return { applicable: true, status: 'no_data', cumulativeReturn: null, categoryId };
    if (valuation.status !== 'ready' || typeof valuation.totalPnl !== 'number' || !Number.isFinite(valuation.totalPnl)) {
      return pending(categoryId);
    }
    // Use the actual latest valued point, NOT the maximum saved/future rule version.
    const latest = valuation.points.find(point => point.date === valuation.latestDate);
    return { applicable: true, status: 'ready', cumulativeReturn: valuation.totalPnl, categoryId,
      ...(latest && positiveId(latest.ruleVersion) ? { ruleVersion: latest.ruleVersion } : {}) };
  } catch { return pending(categoryId); }
}
