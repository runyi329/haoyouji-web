import { TRPCError } from '@trpc/server';
import { getDbConnection } from './db';
import { decryptValue, isEncrypted } from './encryption';
import { readAllOrdinaryTagDownsideRules } from './ordinary-tag-downside-rules';
import { readTagVisible } from '../shared/tag-visibility';
import { isStockSessionDate, previousStockMarketSession } from '../shared/stock-market-session';
import { calculateOrdinaryTagDownsideSeries, type OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';

const LEDGER_ID = 37 as const;
type Connection = NonNullable<Awaited<ReturnType<typeof getDbConnection>>>;
export type OrdinaryTagDownsideValuationRecord = {
  ledgerId: number;
  /** Must already be mapped to the eligible root; direct children are mapped by the batch SQL. */
  categoryId: number | null;
  recordDate: string | Date;
  type: 'income' | 'expense' | 'transfer';
  amount: number | string | null;
  description?: string | null;
  createdAt?: string | Date | null;
  id?: number;
  recordId?: number;
  deletedAt?: string | Date | null;
  deleted_at?: string | Date | null;
};
export type OrdinaryTagDownsideValuationPoint = {
  date: string;
  /** null marks an explicit missing/invalid latest balance; never falls back to an old ready point. */
  balance: number | null;
  countedBalance: number | null;
  pnl: number | null;
  dailyPnl: number | null;
  rawPnl: number | null;
  capitalChange: number;
  withdrawToDate: number;
  capitalChangeToday: number;
  withdrawToday: number;
  ruleVersion: number | null;
};
export type OrdinaryTagDownsideCategoryValuation = {
  categoryId: number;
  categoryName: string;
  status: 'ready' | 'pending' | 'no_data';
  points: OrdinaryTagDownsideValuationPoint[];
  latestDate: string | null;
  totalPnl: number | null;
  todayPnl: number | null;
};
export type BuildOrdinaryTagDownsideValuationInput = {
  ledgerId: 37;
  userId: number;
  categoryId: number;
  categoryName: string;
  balances: Record<string, unknown>;
  /** Root-scoped real rows; transfer descriptions may still be encrypted. No fetch occurs. */
  records: readonly OrdinaryTagDownsideValuationRecord[];
  rules: readonly OrdinaryTagDownsideRule[];
  today: string;
};
type Member = { id: number; ledgerId: number; userId: number; memberType: string; initialBalances: string | null; ownerId: number };
type Category = { id: number; ledgerId: number; name: string; parentId: number | null; isDefault: number; accountingMode: string };
type PausePeriod = { pauseDate: string; resumeDate?: string };
type PauseState = { periods: PausePeriod[]; valid: boolean };
type CanonicalPoint = { date: string; rawBalance: number | null; capitalChange: number; withdraw: number };

function fail(message: string): never { throw new TRPCError({ code: 'PRECONDITION_FAILED', message }); }
function positiveId(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
/** SQL DATE_FORMAT strings are already Beijing business dates; Date/ISO timestamps are converted explicitly. */
export function ordinaryTagDownsideBusinessDate(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return isStockSessionDate(value) ? value : null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    const day = value.slice(0, 10);
    return isStockSessionDate(day) ? day : null;
  }
  const date = value instanceof Date ? value : typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
}
function amountOf(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === ''
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value))) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function referenceAmount(value: unknown): number | null {
  const n = amountOf(value);
  return n !== null && n >= 0 ? n : null;
}
function readPauses(balances: Record<string, unknown>, name: string): PauseState {
  const raw = balances[`${name}__pauseHistory`];
  if (raw !== undefined && raw !== null && raw !== '') {
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) throw new Error('invalid history');
      const periods: PausePeriod[] = parsed.map((item: unknown) => {
        if (!item || typeof item !== 'object') throw new Error('invalid period');
        const period = item as Record<string, unknown>;
        const pauseDate = ordinaryTagDownsideBusinessDate(period.pauseDate);
        const hasResume = period.resumeDate !== undefined && period.resumeDate !== null && period.resumeDate !== '';
        const resumeDate = hasResume ? ordinaryTagDownsideBusinessDate(period.resumeDate) : null;
        if (!pauseDate || (hasResume && (!resumeDate || resumeDate <= pauseDate))) throw new Error('invalid dates');
        return { pauseDate, ...(resumeDate ? { resumeDate } : {}) };
      });
      return { periods, valid: true }; // Valid [] deliberately overrides a stale legacy cutoff.
    } catch {
      // Damaged history cannot expose records after a known legacy pause; otherwise stay pending.
      const legacy = ordinaryTagDownsideBusinessDate(balances[`${name}__pauseDate`]);
      return { periods: legacy ? [{ pauseDate: legacy }] : [], valid: Boolean(legacy) };
    }
  }
  const legacy = balances[`${name}__pauseDate`];
  if (legacy === undefined || legacy === null || legacy === '') return { periods: [], valid: true };
  const pauseDate = ordinaryTagDownsideBusinessDate(legacy);
  return { periods: pauseDate ? [{ pauseDate }] : [], valid: Boolean(pauseDate) };
}
function paused(date: string, periods: readonly PausePeriod[]): boolean {
  return periods.some(p => date > p.pauseDate && (!p.resumeDate || date < p.resumeDate));
}
function cutoffOf(pauses: PauseState, today: string): string {
  return pauses.periods.reduce((cutoff, p) => !p.resumeDate && p.pauseDate < cutoff ? p.pauseDate : cutoff, today);
}
function createdOrder(value: OrdinaryTagDownsideValuationRecord['createdAt']): string {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().replace(/Z$/, '000') : '';
  if (typeof value !== 'string') return '';
  // DATE_FORMAT audit values preserve fractional microseconds and deterministic database order.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    const [base, fraction = ''] = value.replace(' ', 'T').split('.');
    return `${base}.${fraction.padEnd(6, '0')}`;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace(/Z$/, '000') : value;
}
function canonicalPoints(input: BuildOrdinaryTagDownsideValuationInput, entryDate: string | null, pauses: PauseState): CanonicalPoint[] {
  const cutoff = cutoffOf(pauses, input.today);
  const rows = input.records.map(record => ({ record, date: ordinaryTagDownsideBusinessDate(record.recordDate) }))
    .filter((r): r is { record: OrdinaryTagDownsideValuationRecord; date: string } => Boolean(r.date)
      && r.record.ledgerId === LEDGER_ID && r.record.categoryId === input.categoryId
      && !r.record.deletedAt && !r.record.deleted_at && r.date! <= cutoff && !paused(r.date!, pauses.periods))
    .sort((a, b) => a.date.localeCompare(b.date)
      || createdOrder(a.record.createdAt).localeCompare(createdOrder(b.record.createdAt))
      || (a.record.recordId ?? a.record.id ?? 0) - (b.record.recordId ?? b.record.id ?? 0));
  const days = new Map<string, { hasBalance: boolean; balance: number | null; capital: number; withdraw: number }>();
  for (const { record, date } of rows) {
    const day = days.get(date) ?? { hasBalance: false, balance: null, capital: 0, withdraw: 0 };
    const amount = amountOf(record.amount);
    if (record.type === 'income' || record.type === 'expense') {
      // Last non-transfer wins, even if its amount is missing. Never resurrect an earlier same-day balance.
      day.hasBalance = true;
      day.balance = amount !== null && amount >= 0 ? amount : null;
    } else if (record.type === 'transfer' && (!entryDate || date >= entryDate)) {
      if (amount === null) fail('本金或提现流水金额缺失，不能计算欠保证金收益');
      const description = typeof record.description === 'string' ? decryptValue(record.description) : null;
      if (description && isEncrypted(description)) fail('本金流水备注无法解密，不能计算欠保证金收益');
      const absolute = Math.abs(amount);
      if (description?.startsWith('capital_')) day.capital += description.startsWith('capital_add') ? absolute : -absolute;
      else day.withdraw += absolute;
    }
    if (![day.capital, day.withdraw].every(Number.isFinite)) fail('真实资金流累计溢出');
    days.set(date, day);
  }
  const points: CanonicalPoint[] = [];
  let capitalChange = 0, withdraw = 0;
  const baselineCutoff = entryDate ? previousStockMarketSession(entryDate, 'A') : null;
  let baseline: CanonicalPoint | null = null;
  for (const [date, day] of Array.from(days.entries())) {
    if (entryDate && date < entryDate) {
      if (day.hasBalance && baselineCutoff && date <= baselineCutoff) baseline = { date, rawBalance: day.balance, capitalChange: 0, withdraw: 0 };
      continue;
    }
    capitalChange += day.capital;
    withdraw += day.withdraw;
    if (![capitalChange, withdraw].every(Number.isFinite)) fail('真实资金流区间累计溢出');
    if (!day.hasBalance) continue; // Transfer-only dates are not balance evidence; retain interval flows.
    points.push({ date, rawBalance: day.balance, capitalChange, withdraw });
    capitalChange = withdraw = 0;
  }
  return baseline ? [baseline, ...points] : points;
}
function emptyCategory(input: BuildOrdinaryTagDownsideValuationInput, status: OrdinaryTagDownsideCategoryValuation['status']): OrdinaryTagDownsideCategoryValuation {
  return { categoryId: input.categoryId, categoryName: input.categoryName, status, points: [], latestDate: null, totalPnl: null, todayPnl: null };
}
/** Pure, reusable read adapter. Caller owns membership/visibility authorization and root mapping.
 * No DB, prices, wallet, member lookup, config writes or rule-parameter DTO fields.
 */
export function buildOrdinaryTagDownsideValuation(input: BuildOrdinaryTagDownsideValuationInput): OrdinaryTagDownsideCategoryValuation {
  if (input.ledgerId !== LEDGER_ID || !positiveId(input.userId) || !positiveId(input.categoryId) || !isStockSessionDate(input.today)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的普通标签估值范围或日期' });
  }
  const pauses = readPauses(input.balances, input.categoryName);
  if (!pauses.valid) return emptyCategory(input, 'pending');
  const initialAmount = referenceAmount(input.balances[input.categoryName]);
  const entryDate = ordinaryTagDownsideBusinessDate(input.balances[`${input.categoryName}__startDate`]);
  const storedRatio = input.balances[`${input.categoryName}__ratio`];
  const ratio = storedRatio === undefined || storedRatio === null ? 100 : referenceAmount(storedRatio);
  if (ratio === null || (entryDate && entryDate > input.today)) return emptyCategory(input, 'pending');
  const canonical = canonicalPoints(input, entryDate, pauses);
  // A real last pre-entry B supplies the interval comparison baseline, not a profit observation.
  // Bridge cumulative raw/counting back to the member's true reference initial; never infer initial from B.
  const baseline = entryDate && canonical[0]?.date < entryDate ? canonical[0] : null;
  const seriesInitial = initialAmount !== null && baseline ? baseline.rawBalance : initialAmount;
  const bridge = initialAmount !== null && seriesInitial !== null ? (initialAmount - seriesInitial) * ratio / 100 : 0;
  if (!Number.isFinite(bridge)) return emptyCategory(input, 'pending');
  const calculated = calculateOrdinaryTagDownsideSeries({ ledgerId: LEDGER_ID, categoryId: input.categoryId,
    initialAmount: seriesInitial, entryDate, ratio, points: canonical, rules: input.rules });
  let capitalChange = 0, withdrawToDate = 0;
  const cashflowByDate = new Map(canonical.filter(p => !entryDate || p.date >= entryDate).map(p => [p.date, p]));
  const effective = calculated.filter(point => (!entryDate || point.date >= entryDate)
    && point.status !== 'before-entry');
  let overflow = false;
  const bridgedPnl = (value: number | null): number | null => {
    if (value === null) return null;
    const pnl = value + bridge;
    if (!Number.isFinite(pnl)) { overflow = true; return null; }
    return pnl === 0 ? 0 : pnl;
  };
  let intervalCapital = 0, intervalWithdraw = 0;
  const points: OrdinaryTagDownsideValuationPoint[] = effective.map(point => {
    const cashflow = cashflowByDate.get(point.date);
    capitalChange += cashflow?.capitalChange ?? 0;
    withdrawToDate += cashflow?.withdraw ?? 0;
    intervalCapital += cashflow?.capitalChange ?? 0;
    intervalWithdraw += cashflow?.withdraw ?? 0;
    if (![capitalChange, withdrawToDate, intervalCapital, intervalWithdraw].every(Number.isFinite)) fail('真实本金或提现累计溢出');
    const dto = { date: point.date, balance: point.rawBalance, countedBalance: point.countedBalance,
      pnl: bridgedPnl(point.countedPnl), dailyPnl: point.dailyCountedPnl, rawPnl: bridgedPnl(point.rawPnl),
      capitalChange, withdrawToDate, capitalChangeToday: intervalCapital,
      withdrawToday: intervalWithdraw, ruleVersion: point.ruleVersion };
    if (point.rawBalance !== null) intervalCapital = intervalWithdraw = 0;
    return dto;
  });
  const latest = points[points.length - 1];
  return { categoryId: input.categoryId, categoryName: input.categoryName,
    status: initialAmount === null || entryDate === null || overflow || effective[effective.length - 1]?.status === 'pending' ? 'pending' : latest ? 'ready' : 'no_data',
    points, latestDate: latest?.date ?? null,
    totalPnl: latest?.pnl ?? null, todayPnl: latest?.date === input.today ? latest.dailyPnl : null };
}
async function selectRows<T>(conn: Connection, sql: string, values: Array<number | string>): Promise<T[]> {
  const [rows] = await conn.execute(sql, values);
  if (!Array.isArray(rows)) fail('数据库读取结果异常');
  return rows as unknown as T[];
}
function memberBalances(member: Member): Record<string, unknown> {
  if (member.initialBalances === null || member.initialBalances === '') return {};
  try {
    const balances: unknown = JSON.parse(member.initialBalances);
    if (!balances || typeof balances !== 'object' || Array.isArray(balances)) throw new Error('invalid');
    return balances as Record<string, unknown>;
  } catch { return fail('成员初始设置格式异常，不能放宽标签读取范围'); }
}
export async function getMyOrdinaryTagDownsideValuations(input: {
  ledgerId: number; userId: number; systemRole?: string; isViewingAs?: boolean;
}): Promise<{ ledgerId: 37; categories: OrdinaryTagDownsideCategoryValuation[] }> {
  if (input.ledgerId !== LEDGER_ID) throw new TRPCError({ code: 'BAD_REQUEST', message: '普通标签欠保证金仅支持37号账本' });
  if (!positiveId(input.userId)) throw new TRPCError({ code: 'UNAUTHORIZED', message: '缺少有效的真实用户身份' });
  // These fields are not part of the contract; fail closed even when called without the authenticated router.
  const extra = input as unknown as Record<string, unknown>;
  for (const key of ['viewAsUserId', 'targetUserId', 'actorUserId']) {
    if (extra[key] !== undefined && extra[key] !== input.userId) throw new TRPCError({ code: 'FORBIDDEN', message: '不能指定客户端第三方用户' });
  }
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接不可用' });
  const members = await selectRows<Member>(conn,
    `SELECT m.id, m.ledgerId, m.userId, m.member_type AS memberType,
            m.initial_balances AS initialBalances, l.ownerId
     FROM ledger_members m
     INNER JOIN users u ON u.id = m.userId
     INNER JOIN ledgers l ON l.id = m.ledgerId
     WHERE m.ledgerId = ? AND m.userId = ? LIMIT 1`, [LEDGER_ID, input.userId]);
  const member = members[0];
  if (members.length !== 1 || !member || member.ledgerId !== LEDGER_ID || member.userId !== input.userId || member.memberType !== 'real') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅37号账本真实成员可读取本人的普通标签估值' });
  }
  // One SELECT-only batch AFTER membership validation. Errors propagate, never raw/no-rule fallback.
  const rules = await readAllOrdinaryTagDownsideRules(conn, LEDGER_ID);
  if (!Array.from(rules.values()).some(versions => versions.length > 0)) return { ledgerId: LEDGER_ID, categories: [] };
  const balances = memberBalances(member);
  const actualOwner = member.ownerId === input.userId && !input.isViewingAs;
  const categories = (await selectRows<Category>(conn,
    `SELECT id, ledgerId, name, parentId, isDefault, accounting_mode AS accountingMode
     FROM ledger_categories WHERE ledgerId = ? AND parentId IS NULL
       AND isDefault = 0 AND accounting_mode = 'manual_balance' ORDER BY sortOrder ASC, id ASC`, [LEDGER_ID]))
    .filter(c => positiveId(c.id) && c.ledgerId === LEDGER_ID && c.parentId === null && Number(c.isDefault) === 0
      && c.accountingMode === 'manual_balance' && typeof c.name === 'string' && Boolean(c.name.trim())
      && Boolean(rules.get(c.id)?.length) && (actualOwner || readTagVisible(balances, c.name)));
  if (!categories.length) return { ledgerId: LEDGER_ID, categories: [] };
  const today = ordinaryTagDownsideBusinessDate(new Date())!;
  const usableCategories = categories.filter(c => readPauses(balances, c.name).valid);
  let records: OrdinaryTagDownsideValuationRecord[] = [];
  if (usableCategories.length) {
    const ids = usableCategories.map(c => c.id);
    const inScope = ids.map(() => '?').join(', ');
    const cutoffs = usableCategories.map(c => cutoffOf(readPauses(balances, c.name), today));
    const cutoffScope = usableCategories.map(() => '((c.id = ? OR c.parentId = ?) AND r.recordDate <= ?)').join(' OR ');
    records = await selectRows<OrdinaryTagDownsideValuationRecord>(conn,
      `SELECT r.ledgerId, COALESCE(c.parentId, c.id) AS categoryId,
              DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate, r.type, r.amount,
              r.id AS recordId, DATE_FORMAT(r.createdAt, '%Y-%m-%d %H:%i:%s.%f') AS createdAt,
              CASE WHEN r.type = 'transfer' THEN r.description ELSE NULL END AS description,
              r.deleted_at AS deletedAt
       FROM ledger_records r
       INNER JOIN ledger_categories c ON c.id = r.categoryId AND c.ledgerId = r.ledgerId
       WHERE r.ledgerId = ? AND (c.id IN (${inScope}) OR c.parentId IN (${inScope}))
         AND r.deleted_at IS NULL AND r.recordDate <= ? AND (${cutoffScope})
       ORDER BY r.recordDate ASC, r.createdAt ASC, r.id ASC`,
      [LEDGER_ID, ...ids, ...ids, today, ...usableCategories.flatMap((c, index) => [c.id, c.id, cutoffs[index]])]);
    const eligible = new Set(ids);
    // Defense-in-depth even if a driver/mock returns rows outside the SQL scope.
    records = records.filter(row => row.ledgerId === LEDGER_ID && row.categoryId !== null && eligible.has(row.categoryId)
      && !row.deletedAt && !row.deleted_at && Boolean(ordinaryTagDownsideBusinessDate(row.recordDate))
      && ordinaryTagDownsideBusinessDate(row.recordDate)! <= today);
  }
  // Pure builder can be reused by availability after its own one-time batch rules/history SELECT.
  return { ledgerId: LEDGER_ID, categories: categories.map(category => buildOrdinaryTagDownsideValuation({
    ledgerId: LEDGER_ID, userId: input.userId, categoryId: category.id, categoryName: category.name,
    balances, records, rules: rules.get(category.id)!, today,
  })) };
}
