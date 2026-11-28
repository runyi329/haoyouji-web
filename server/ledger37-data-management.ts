import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Ledger37Actor } from './ledger37-calendar-recorder';
import type { Ledger37DataManagementResult, Ledger37DataMember, Ledger37DataTag, Ledger37DataPoint } from '../shared/ledger37-data-management';
import { ledger37TagParticipatesOnDate } from '../shared/ledger37-data-management';
import type { OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';
import type { UserTagDownsideOverride } from '../shared/user-tag-downside-override';
import { buildOrdinaryTagDownsideValuation, ordinaryTagDownsideBusinessDate, type OrdinaryTagDownsideValuationRecord } from './ordinary-tag-downside-valuation';
import { stockOverviewSettlementDisplay } from '../client/src/lib/stock-overview-settlement-display';
import { nullableStockNumber, stockDateKey } from '../client/src/lib/ledger-stock-calendar';
import { isStockSessionDate, previousStockMarketSession } from '../shared/stock-market-session';
import { getUnifiedStockCloseSnapshotDate } from '../shared/stock-unified-close-policy';
import { cryptoPortfolioBeijingDate, latestCryptoPortfolioSnapshotDate } from '../shared/crypto-portfolio-policy';
import { readTagVisible } from '../shared/tag-visibility';
import { readOrdinaryTagObservationConfig } from '../shared/ordinary-tag-observation';
import { decryptValue, isEncrypted } from './encryption';

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const dataManagementSchema = z.object({
  ledgerId: z.literal(37), page: positiveId.default(1), pageSize: positiveId.max(20).default(10),
  keyword: z.string().max(80).default(''), targetUserId: positiveId.optional(), allMembers: z.boolean().optional(),
}).strict();
export type Ledger37DataManagementDependencies = {
  connection: any;
  /** Caller supplies the authorized target's PERSONAL overview; never total/observation scope. */
  loadStockOverview: (userId: number) => Promise<any[]>;
  readOrdinaryRules: (connection: any) => Promise<Map<number, OrdinaryTagDownsideRule[]>>;
  readOverrides: (connection: any) => Promise<UserTagDownsideOverride[]>;
};
type Member = { ledgerId: number; userId: number; memberType: string; username: string | null;
  name?: string | null; nickname?: string | null; avatar: string | null; initialBalances: unknown; permissionView: string };
type Category = { id: number; ledgerId: number; name: string; parentId: number | null;
  isDefault: number | null; accountingMode: string; type: string };
type RecordRow = OrdinaryTagDownsideValuationRecord & { createdBy: number; legacyCategoryId: number | null };
type Pause = { pauseDate: string; resumeDate?: string };
const NOTICE = '个人回报暂未核验，请稍后刷新或联系账本所有者';
const LEGACY_NOTICE = '沿用普通标签首页回报口径；结束标志不冻结回报';
function forbidden(): never { throw new TRPCError({ code: 'FORBIDDEN', message: '仅37号账本真实所有者或真实管理员可读取数据管理' }); }
function invalid(): never { throw new Error('invalid read evidence'); }
function number(value: unknown): number | null { return nullableStockNumber(value); }
function balancesOf(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined || raw === '') return {};
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid();
  return parsed as Record<string, unknown>;
}
async function select(connection: any, sql: string, values: unknown[]): Promise<any[]> {
  const [rows] = await connection.execute(sql, values);
  if (!Array.isArray(rows)) return invalid();
  return rows;
}
async function authorize(ctx: Ledger37Actor, connection: any): Promise<boolean> {
  if (!ctx?.user || !Number.isSafeInteger(ctx.user.id) || ctx.user.id <= 0
    || ctx.isViewingAs || (ctx.realUser && ctx.realUser.id !== ctx.user.id)) return forbidden();
  // Independent narrow READ policy. Do not trust ctx roles, fake member owner, or old helpers.
  const rows = await select(connection, `SELECT l.id AS ledgerId, l.ownerId, m.userId AS memberUserId,
    m.role AS memberRole, m.member_type AS memberType
    FROM ledgers l INNER JOIN ledger_members m ON m.ledgerId = l.id AND m.userId = ?
    INNER JOIN users u ON u.id = m.userId
    WHERE l.id = 37 AND m.member_type = 'real' ORDER BY m.id ASC`, [ctx.user.id]);
  if (rows.length !== 1) return forbidden();
  const row = rows[0];
  if (Number(row.ledgerId) !== 37 || Number(row.memberUserId) !== ctx.user.id || row.memberType !== 'real') return forbidden();
  const owner = Number(row.ownerId) === ctx.user.id;
  if (!owner && row.memberRole !== 'admin') return forbidden();
  return owner;
}
function readPauses(balances: Record<string, unknown>, name: string): Pause[] {
  const raw = balances[`${name}__pauseHistory`];
  if (raw !== undefined && raw !== null && raw !== '') {
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return invalid();
      return parsed.map(item => {
        if (!item || !isStockSessionDate(item.pauseDate) || (item.resumeDate && (!isStockSessionDate(item.resumeDate) || item.resumeDate <= item.pauseDate))) return invalid();
        return { pauseDate: item.pauseDate, ...(item.resumeDate ? { resumeDate: item.resumeDate } : {}) };
      });
    } catch {
      const legacy = balances[`${name}__pauseDate`];
      if (isStockSessionDate(legacy)) return [{ pauseDate: legacy }];
      return invalid();
    }
  }
  const legacy = balances[`${name}__pauseDate`];
  if (legacy === undefined || legacy === null || legacy === '') return [];
  if (!isStockSessionDate(legacy)) return invalid();
  return [{ pauseDate: legacy }];
}
function inPause(date: string, periods: Pause[]): boolean {
  return periods.some(p => date > p.pauseDate && (!p.resumeDate || date < p.resumeDate));
}
function cutoff(periods: Pause[], today: string): string {
  return periods.reduce((date, p) => !p.resumeDate && p.pauseDate < date ? p.pauseDate : date, today);
}
function tagBase(category: Category, startDate: string | null): Ledger37DataTag {
  return { categoryId: category.id, name: category.name,
    accountingMode: category.accountingMode === 'stock_portfolio' ? 'stock_portfolio' : 'manual_balance',
    startDate, status: 'pending', totalPnl: null, asOf: null, dailyPnl: null, dailyDate: null, notice: NOTICE, points: [] };
}
function statusOf(start: string | null, periods: Pause[], balances: Record<string, unknown>, name: string, today: string): Ledger37DataTag['status'] {
  if (!start || start > today) return 'pending';
  if (periods.some(p => p.pauseDate <= today && (!p.resumeDate || p.resumeDate > today))) return 'paused';
  const end = balances[`${name}__endDate`];
  return isStockSessionDate(end) && end <= today ? 'ended' : 'active';
}
/** Exact legacy AA formulas: income wins, zero-only dates skipped, full dated flows (including pre-entry),
 * previous A-session cutoff, same-day flows for daily, and first-point ratio applied AGAIN as in 3673.
 * Unlike the old UI, absent initial/start, unreadable evidence and no data never manufacture zero.
 */
function legacyOrdinary(category: Category, balances: Record<string, unknown>, records: RecordRow[], today: string): Ledger37DataTag {
  const name = category.name, start = ordinaryTagDownsideBusinessDate(balances[`${name}__startDate`]);
  const tag = tagBase(category, start);
  const initial = number(balances[name]);
  const storedRatio = balances[`${name}__ratio`];
  const cumulativeRatio = storedRatio === undefined || storedRatio === null ? 100 : number(storedRatio);
  const dailyRatio = storedRatio === undefined || storedRatio === null ? 0 : number(storedRatio);
  const pauses = readPauses(balances, name), until = cutoff(pauses, today);
  tag.pausePeriods = pauses;
  if (initial === null || initial < 0 || !start || start > today || cumulativeRatio === null || dailyRatio === null || cumulativeRatio < 0) return tag;
  const days = new Map<string, { income: number; expense: number; capital: number; withdraw: number; invalid: boolean }>();
  // Legacy getTransactionsList.category is the complete 3-level path, not root name for children.
  for (const row of records) {
    const date = ordinaryTagDownsideBusinessDate(row.recordDate);
    if (row.legacyCategoryId !== category.id || !date || date > until || inPause(date, pauses)) continue;
    const d = days.get(date) ?? { income: 0, expense: 0, capital: 0, withdraw: 0, invalid: false };
    const amount = number(row.amount);
    if (amount === null) d.invalid = true;
    else if (row.type === 'income') d.income += Math.abs(amount);
    else if (row.type === 'expense') d.expense += Math.abs(amount);
    else if (row.type === 'transfer') {
      const description = row.description ? decryptValue(row.description) : '';
      if (description && isEncrypted(description)) return invalid();
      if (description?.startsWith('capital_')) d.capital += description.startsWith('capital_add') ? Math.abs(amount) : -Math.abs(amount);
      else d.withdraw += Math.abs(amount);
    }
    days.set(date, d);
  }
  const previousSession = previousStockMarketSession(start, 'A');
  if (!previousSession) return tag;
  let capital = 0, withdraw = 0;
  const calculated: Array<Ledger37DataPoint & { balance: number | null }> = [];
  for (const [date, day] of Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    capital += day.capital; withdraw += day.withdraw;
    if (day.invalid || ![capital, withdraw, day.income, day.expense].every(Number.isFinite)) return tag;
    if (day.income === 0 && day.expense === 0) continue;
    if (date < previousSession) continue;
    const balance = day.income > 0 ? day.income : day.expense;
    const totalPnl = (initial + capital - balance - withdraw) * (cumulativeRatio / 100);
    const prior = calculated[calculated.length - 1];
    const dailyPnl = prior?.balance !== null && prior?.balance !== undefined
      ? (prior.balance + day.capital - day.withdraw - balance) * (dailyRatio / 100)
      : dailyRatio > 0 ? totalPnl * (dailyRatio / 100) : dailyRatio === 0 ? 0 : totalPnl;
    if (![totalPnl, dailyPnl].every(Number.isFinite)) return tag;
    calculated.push({ date, totalPnl, dailyPnl, balance });
  }
  const latest = calculated[calculated.length - 1];
  if (!latest) return tag;
  tag.status = statusOf(start, pauses, balances, name, today);
  tag.totalPnl = latest.totalPnl; tag.asOf = latest.date;
  tag.dailyPnl = latest.dailyPnl; tag.dailyDate = latest.dailyPnl === null ? null : latest.date;
  tag.points = calculated.map(({ date, totalPnl, dailyPnl }) => ({ date, totalPnl, dailyPnl }));
  tag.notice = LEGACY_NOTICE;
  return tag;
}
function ordinary(category: Category, member: Member, balances: Record<string, unknown>, records: RecordRow[],
  rules: Map<number, OrdinaryTagDownsideRule[]>, overrides: UserTagDownsideOverride[], today: string): Ledger37DataTag {
  if (!rules.get(category.id)?.length) return legacyOrdinary(category, balances, records, today);
  const start = ordinaryTagDownsideBusinessDate(balances[`${category.name}__startDate`]);
  const tag = tagBase(category, start), pauses = readPauses(balances, category.name);
  tag.pausePeriods = pauses;
  if (!start || start > today || number(balances[category.name]) === null) return tag;
  const valuation = buildOrdinaryTagDownsideValuation({ ledgerId: 37, userId: member.userId, categoryId: category.id,
    categoryName: category.name, balances, records: records.filter(r => !inPause(String(r.recordDate), pauses)),
    rules: rules.get(category.id)!, userTagDownsideOverrides: overrides, today });
  tag.points = valuation.points.filter(p => !inPause(p.date, pauses)).map(p => ({ date: p.date, totalPnl: p.pnl, dailyPnl: p.dailyPnl }));
  if (valuation.status !== 'ready') return tag;
  const latest = tag.points[tag.points.length - 1];
  tag.totalPnl = valuation.totalPnl; tag.asOf = valuation.latestDate;
  tag.dailyPnl = latest?.dailyPnl ?? null; tag.dailyDate = tag.dailyPnl === null ? null : latest.date;
  tag.status = statusOf(start, pauses, balances, category.name, today);
  tag.notice = tag.status === 'ended' ? '结束标志仅展示；回报沿用已核验流水，不据此冻结' : null;
  return tag;
}
function stock(category: Category, row: any, balances: Record<string, unknown>, today: string, now: Date): Ledger37DataTag {
  // Legacy portfolio can fabricate `today` when both participation.start_date and lot.opened_at
  // are absent. A bare overview startDate is not evidence; accept saved member configuration or
  // an explicitly provenance-verified injected overview, never its fallback date.
  const savedStart = ordinaryTagDownsideBusinessDate(balances[`${category.name}__startDate`]);
  const provenStart = row.startDateVerified === true || ['participation', 'lot_opened_at'].includes(row.startDateSource)
    ? ordinaryTagDownsideBusinessDate(row.startDate) : null;
  const start = provenStart ?? savedStart, tag = tagBase(category, start);
  const pauses = readPauses(balances, category.name), until = cutoff(pauses, today);
  tag.pausePeriods = pauses;
  if (!start || start > today) return tag;
  const points = (Array.isArray(row.points) ? row.points : []).filter((p: any) => {
    const date = stockDateKey(p.snapshotDate ?? p.date);
    return date && date >= start && date <= until && !inPause(date, pauses);
  });
  const summary = { ...(row.summary ?? {}) };
  // Live totalPnl/valuationDate is not publication evidence in this injected personal overview.
  delete summary.totalPnl;
  delete summary.valuationDate;
  // Pause history also applies to summary snapshots/metadata, not merely chart points.
  for (const field of ['latestSnapshot', 'priorSnapshot', 'lastConfirmedSnapshot']) {
    const d = stockDateKey(summary[field]?.snapshotDate ?? summary[field]?.date);
    if (d && (d < start || inPause(d, pauses))) delete summary[field];
  }
  for (const field of ['confirmedAsOf', 'valuationDate']) {
    const d = stockDateKey(summary[field]);
    if (d && (d < start || inPause(d, pauses))) {
      if (field === 'confirmedAsOf') { delete summary.confirmedAsOf; delete summary.confirmedTotalPnl; }
      else { delete summary.valuationDate; delete summary.totalPnl; }
    }
  }
  const display = stockOverviewSettlementDisplay({ summary, points,
    expectedStockDate: getUnifiedStockCloseSnapshotDate(now), expectedCryptoDate: latestCryptoPortfolioSnapshotDate(now),
    cutoffDate: until < today ? until : null });
  // Every detail point is publication evidence, never live summary/observation or rescaled total-portfolio P&L.
  tag.points = points.map((p: any) => {
    const date = stockDateKey(p.snapshotDate ?? p.date)!;
    const valid = p.ready !== false && p.priced !== false && !['pending', 'missing'].includes(p.status);
    const totalPnl = valid ? number('totalPnl' in p ? p.totalPnl : p.pnl) : null;
    const dailyPnl = totalPnl !== null && p.dailyPnlReady !== false ? number('dailyPnl' in p ? p.dailyPnl : p.stockDailyPnl) : null;
    return { date, totalPnl, dailyPnl };
  }).sort((a: Ledger37DataPoint, b: Ledger37DataPoint) => a.date.localeCompare(b.date));
  tag.totalPnl = display.confirmedTotalPnl; tag.asOf = display.confirmedAsOf;
  tag.dailyPnl = display.dailyPnl; tag.dailyDate = display.dailyDate;
  tag.status = tag.totalPnl === null ? 'pending' : statusOf(start, pauses, balances, category.name, today);
  tag.notice = tag.totalPnl === null ? NOTICE : display.dailyPnl === null ? '保留最近已确认累计；预期日结尚未核验，不以旧日收益替代' : null;
  return tag;
}
function summarize(member: Member, tags: Ledger37DataTag[], failed = false): Ledger37DataMember {
  const ready = tags.filter(t => t.totalPnl !== null && Number.isFinite(t.totalPnl));
  const pendingTagNames = tags.filter(t => t.totalPnl === null).map(t => t.name);
  if (failed && !pendingTagNames.length) pendingTagNames.push('个人数据待核验');
  const dates = Array.from(new Set(tags.flatMap(t => t.asOf ? [t.asOf] : []))).sort();
  const dailyDates = Array.from(new Set(tags.flatMap(t => t.dailyPnl !== null && t.dailyDate ? [t.dailyDate] : [])));
  const targetDate = dailyDates.sort().at(-1) ?? null;
  const dailyScope = targetDate ? tags.filter(t => ledger37TagParticipatesOnDate(t, targetDate)) : tags;
  const dailyPending = dailyScope.filter(t => t.dailyPnl === null || !targetDate || t.dailyDate !== targetDate).length;
  const complete = dailyScope.length > 0 && dailyPending === 0 && targetDate !== null;
  const subtotal = ready.length ? ready.reduce((sum, t) => sum + t.totalPnl!, 0) : null;
  const daily = complete ? dailyScope.reduce((sum, t) => sum + t.dailyPnl!, 0) : null;
  const knownDaily = dailyScope.filter(t => t.dailyDate === targetDate && t.dailyPnl !== null && Number.isFinite(t.dailyPnl));
  const dailySubtotal = knownDaily.length ? knownDaily.reduce((sum, t) => sum + t.dailyPnl!, 0) : null;
  const starts = tags.flatMap(t => t.startDate ? [t.startDate] : []).sort();
  return { userId: member.userId, username: member.username ?? '', displayName: member.nickname || member.name || member.username || String(member.userId),
    avatar: member.avatar ?? null, startDate: starts[0] ?? null, tagCount: tags.length,
    totalPnl: !failed && tags.length > 0 && !pendingTagNames.length && subtotal !== null && Number.isFinite(subtotal) ? subtotal : null,
    verifiedSubtotal: subtotal !== null && Number.isFinite(subtotal) ? subtotal : null, pendingTagNames, asOfDates: dates,
    latestDailyPnl: daily !== null && Number.isFinite(daily) ? daily : null, dailyDate: complete ? targetDate : null,
    dailyVerifiedSubtotal: dailySubtotal !== null && Number.isFinite(dailySubtotal) ? dailySubtotal : null,
    dailyAsOf: targetDate,
    dailyPendingCount: failed && !tags.length ? 1 : dailyPending, tags };
}
async function boundedMap<T, R>(rows: T[], task: (row: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(rows.length); let index = 0;
  await Promise.all(Array.from({ length: Math.min(2, rows.length) }, async () => {
    while (index < rows.length) { const current = index++; result[current] = await task(rows[current]); }
  }));
  return result;
}
/** SELECT-only service. Injected loaders own their I/O; no price retrieval, scan, ensure or business writes here. */
export async function readLedger37DataManagement(ctx: Ledger37Actor, raw: unknown, deps: Ledger37DataManagementDependencies): Promise<Ledger37DataManagementResult> {
  const parsed = dataManagementSchema.safeParse(raw);
  if (!parsed.success) throw new TRPCError({ code: 'BAD_REQUEST', message: '无效的37号数据管理输入' });
  const input = parsed.data, now = new Date(), today = cryptoPortfolioBeijingDate(now);
  try {
    const canEdit = await authorize(ctx, deps.connection);
    const members: Member[] = await select(deps.connection, `SELECT m.ledgerId, m.userId, m.member_type AS memberType,
      m.initial_balances AS initialBalances, m.permission_view AS permissionView, m.nickname,
      u.username, u.name, u.avatar FROM ledger_members m INNER JOIN users u ON u.id = m.userId
      WHERE m.ledgerId = 37 AND m.member_type = 'real' ORDER BY m.userId ASC`, []);
    const seen = new Set<number>();
    for (const m of members) {
      if (Number(m.ledgerId) !== 37 || m.memberType !== 'real' || !Number.isSafeInteger(Number(m.userId)) || Number(m.userId) <= 0 || seen.has(Number(m.userId))) return invalid();
      m.userId = Number(m.userId); seen.add(m.userId);
    }
    if (input.targetUserId !== undefined && !seen.has(input.targetUserId)) throw new TRPCError({ code: 'FORBIDDEN', message: '目标不是37号账本真实成员' });
    const keyword = input.keyword.trim().toLocaleLowerCase();
    const filtered = input.targetUserId !== undefined ? members.filter(m => m.userId === input.targetUserId)
      : members.filter(m => !keyword || [m.username, m.name, m.nickname, String(m.userId)].some(v => String(v ?? '').toLocaleLowerCase().includes(keyword)));
    const allMembers = input.allMembers === true && input.targetUserId === undefined;
    const page = allMembers || input.targetUserId !== undefined ? 1 : input.page;
    const pageSize = allMembers ? Math.max(1, filtered.length) : input.targetUserId !== undefined ? 1 : input.pageSize;
    const visible = allMembers ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
    if (!visible.length) return { ledgerId: 37, canEdit, page, pageSize, totalMembers: filtered.length, members: [], checkedAt: now.toISOString() };
    const categories: Category[] = await select(deps.connection, `SELECT id, ledgerId, name, parentId, isDefault,
      accounting_mode AS accountingMode, type FROM ledger_categories WHERE ledgerId = 37 ORDER BY sortOrder ASC, id ASC`, []);
    const categoryMap = new Map<number, Category>();
    for (const c of categories) {
      c.id = Number(c.id); c.parentId = c.parentId === null ? null : Number(c.parentId);
      if (Number(c.ledgerId) !== 37 || !Number.isSafeInteger(c.id) || c.id <= 0 || categoryMap.has(c.id) || typeof c.name !== 'string' || !c.name.trim()) return invalid();
      categoryMap.set(c.id, c);
    }
    const roots = categories.filter(c => c.parentId === null && !Number(c.isDefault)
      && ['manual_balance', 'stock_portfolio'].includes(c.accountingMode) && ['income', 'expense'].includes(c.type));
    if (new Set(roots.map(c => c.name)).size !== roots.length) return invalid();
    for (const c of categories) {
      let at: Category | undefined = c; const path = new Set<number>();
      while (at?.parentId !== null) {
        if (!at || path.has(at.id) || !categoryMap.has(at.parentId!)) return invalid();
        path.add(at.id); at = categoryMap.get(at.parentId!);
      }
    }
    // One full-history SELECT shared by all page members. No LIMIT, per-user scans or history truncation.
    // One page-scoped batch of actual participation dates. No portfolio `today` fallback.
    const targetIds = visible.map(member => member.userId);
    const [rawRecords, rules, overrides, stockStarts] = await Promise.all([
      select(deps.connection, `SELECT r.ledgerId, r.categoryId, r.createdBy, r.type, r.amount,
        CASE WHEN r.type = 'transfer' THEN r.description ELSE NULL END AS description,
        DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate, r.id AS recordId,
        DATE_FORMAT(r.createdAt, '%Y-%m-%d %H:%i:%s.%f') AS createdAt, r.deleted_at AS deletedAt
        FROM ledger_records r INNER JOIN ledger_categories c ON c.id = r.categoryId AND c.ledgerId = r.ledgerId
        WHERE r.ledgerId = 37 AND r.deleted_at IS NULL AND r.recordDate <= ?`, [today]),
      deps.readOrdinaryRules(deps.connection), deps.readOverrides(deps.connection),
      roots.some(category => category.accountingMode === 'stock_portfolio')
        ? select(deps.connection, `SELECT p.ledger_id AS ledgerId, p.user_id AS userId, p.category_id AS categoryId,
          DATE_FORMAT(MIN(COALESCE(p.start_date, DATE(l.opened_at))), '%Y-%m-%d') AS startDate
          FROM ledger_stock_lot_participations p
          INNER JOIN ledger_stock_lots l ON l.id = p.lot_id AND l.ledger_id = p.ledger_id AND l.category_id = p.category_id
          INNER JOIN ledger_categories c ON c.id = p.category_id AND c.ledgerId = p.ledger_id
          WHERE p.ledger_id = 37 AND p.user_id IN (${targetIds.map(() => '?').join(',')})
            AND p.allocated_quantity > 0 AND c.parentId IS NULL AND c.accounting_mode = 'stock_portfolio'
            AND COALESCE(p.start_date, DATE(l.opened_at)) <= ?
          GROUP BY p.ledger_id, p.user_id, p.category_id`, [...targetIds, today])
        : Promise.resolve([]),
    ]);
    const provenStarts = new Map<string, string>();
    for (const row of stockStarts) {
      const date = ordinaryTagDownsideBusinessDate(row.startDate);
      const key = `${Number(row.userId)}:${Number(row.categoryId)}`;
      if (Number(row.ledgerId) !== 37 || !targetIds.includes(Number(row.userId)) || !date || date > today
        || categoryMap.get(Number(row.categoryId))?.accountingMode !== 'stock_portfolio' || provenStarts.has(key)) return invalid();
      provenStarts.set(key, date);
    }
    const records: RecordRow[] = rawRecords.filter(r => Number(r.ledgerId) === 37 && !r.deletedAt && !r.deleted_at
      && ordinaryTagDownsideBusinessDate(r.recordDate) && ordinaryTagDownsideBusinessDate(r.recordDate)! <= today).map(r => {
      const direct = categoryMap.get(Number(r.categoryId));
      let root = direct; let depth = 0;
      while (root && root.parentId !== null && depth++ < categories.length) root = categoryMap.get(root.parentId);
      return { ...r, ledgerId: 37, categoryId: root?.id ?? null,
        legacyCategoryId: direct?.parentId === null ? direct.id : null, recordDate: ordinaryTagDownsideBusinessDate(r.recordDate)! };
    });
    const results = await boundedMap(visible, async member => {
      let balances: Record<string, unknown>;
      try { balances = balancesOf(member.initialBalances); }
      catch { return summarize(member, roots.map(c => tagBase(c, null)), true); }
      const allowed = roots.filter(c => readTagVisible(balances, c.name));
      const userRecords = member.permissionView === 'all' ? records
        : member.permissionView === 'own' ? records.filter(r => Number(r.createdBy) === member.userId) : [];
      let stockRows: any[] = [], stockFailed = false;
      if (allowed.some(c => c.accountingMode === 'stock_portfolio')) {
        try {
          stockRows = await deps.loadStockOverview(member.userId);
          if (!Array.isArray(stockRows)) return invalid();
          const ids = new Set<number>();
          for (const row of stockRows) {
            const id = Number(row.categoryId), c = categoryMap.get(id);
            if (!c || c.accountingMode !== 'stock_portfolio' || c.parentId !== null || ids.has(id)
              || (row.ledgerId !== undefined && Number(row.ledgerId) !== 37)
              || (row.userId !== undefined && Number(row.userId) !== member.userId)
              || (row.scope !== undefined && !['member', 'personal'].includes(row.scope))
              || row.isObservation === true || row.observation === true) return invalid();
            ids.add(id);
          }
        } catch { stockRows = []; stockFailed = true; }
      }
      const byId = new Map<number, any>(stockRows.map((row): [number, any] => {
        const start = provenStarts.get(`${member.userId}:${Number(row.categoryId)}`);
        return [Number(row.categoryId), start ? { ...row, startDate: start, startDateVerified: true, startDateSource: 'participation' } : row];
      }));
      const tags: Ledger37DataTag[] = [];
      for (const category of allowed) {
        if (category.accountingMode === 'manual_balance') {
          // Explicit no-real-allocation/observation-only is not personal return. Missing configuration remains pending.
          const ratio = number(balances[`${category.name}__ratio`]);
          const target = number(balances[`${category.name}__targetAmount`]);
          if (ratio === 0 || target === 0 || readOrdinaryTagObservationConfig(balances, category.name)?.enabled) continue;
        } else if (!stockFailed && !byId.has(category.id)) continue;
        try {
          tags.push(category.accountingMode === 'stock_portfolio'
            ? stockFailed ? tagBase(category, ordinaryTagDownsideBusinessDate(balances[`${category.name}__startDate`]))
              : stock(category, byId.get(category.id), balances, today, now)
            : ordinary(category, member, balances, userRecords, rules, overrides, today));
        } catch { tags.push(tagBase(category, ordinaryTagDownsideBusinessDate(balances[`${category.name}__startDate`]))); }
      }
      const result = summarize(member, tags, stockFailed);
      if (input.targetUserId === undefined) for (const tag of result.tags) tag.points = [];
      return result;
    });
    return { ledgerId: 37, canEdit, page, pageSize, totalMembers: filtered.length, members: results, checkedAt: now.toISOString() };
  } catch (error) {
    // Never serialize driver errors (SQL, credentials) or internal builder messages to the client.
    if (error instanceof TRPCError && error.code === 'FORBIDDEN'
      && ['仅37号账本真实所有者或真实管理员可读取数据管理', '目标不是37号账本真实成员'].includes(error.message)) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据管理暂不可读取，请稍后重试' });
  }
}
