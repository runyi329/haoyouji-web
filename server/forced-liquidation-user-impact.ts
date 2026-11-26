import { TRPCError } from '@trpc/server';
import { getDbConnection } from './db';
import { readAllStockLotDownsideRules } from './stock-lot-downside-rules';
import { readAllOrdinaryTagDownsideRules } from './ordinary-tag-downside-rules';
import { readUserTagDownsideOverrides } from './user-tag-downside-overrides';
import { isUserTagDownsideExempt, type UserTagDownsideOverride } from '../shared/user-tag-downside-override';
import { buildOrdinaryTagDownsideValuation, ordinaryTagDownsideBusinessDate } from './ordinary-tag-downside-valuation';
import { getLiveStockUsdCnyQuote } from './stock-usd-cny-rate';
import { readStockSaleFxLocks, isR1StockSaleFxScope, validateStockSaleFxLock } from './stock-sale-fx-locks';
import { decodeForcedLiquidationStockQuotes, forcedLiquidationDetailSummary, aggregateForcedLiquidationStockSummaries,
  type ForcedLiquidationCnyFx } from './forced-liquidation-setting-summary';
import { chooseLatestStockQuote, type ForcedLiquidationStockQuote, type ForcedLiquidationSettingDetail } from '../shared/forced-liquidation-display';
import { parsePortfolioInstrument, portfolioCurrency, isCryptoPortfolioSymbol, isValidCryptoPortfolioQuantity } from '../shared/portfolio-instruments';
import { countedStockLotPrice, selectStockLotDownsideRule, resolveStockLotDownsideHistoricalRules,
  stockLotDownsideHistoricalEntryProof, stockLotDownsideMemberEntryAt, stockLotDownsideMemberOffset,
  stockLotDownsidePriceAsOf, type StockLotDownsideRule, type StockLotDownsideMemberEpoch } from '../shared/stock-lot-downside';
import { isTrustedMemberCalendarClose } from './shared/stock-member-calendar';
import type { ForcedLiquidationUserOption, ForcedLiquidationUserImpact, ForcedLiquidationUserImpactCategory,
  ForcedLiquidationUserImpactLine } from '../shared/forced-liquidation-user-impact';
import { readOrdinaryTagObservationConfig, ordinaryTagObservationKey } from '../shared/ordinary-tag-observation';

type Input = { ledgerId: number; userId: number; systemRole?: string; isViewingAs?: boolean };
type Category = { id: number; ledgerId: number; name: string; parentId: number | null; isDefault: number; accountingMode: 'stock_portfolio' | 'manual_balance' };
const validId = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const missingTable = (e: any) => e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146;
function fail(message: string): never { throw new TRPCError({ code: 'PRECONDITION_FAILED', message }); }
function numeric(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === ''
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value))) return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
function wall(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    || !ordinaryTagDownsideBusinessDate(value.slice(0, 10))) return null;
  const iso = `${value.replace(' ', 'T')}+08:00`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}
async function rows(conn: any, sql: string, params: unknown[] = []): Promise<any[]> {
  const [found] = await conn.execute(sql, params);
  if (!Array.isArray(found)) fail('用户强平统计数据库读取结果异常');
  return found;
}
async function authorize(input: Input): Promise<any> {
  if (input.isViewingAs) throw new TRPCError({ code: 'FORBIDDEN', message: '代看身份不能查看或维护全员强平控制' });
  if (input.ledgerId !== 37) throw new TRPCError({ code: 'BAD_REQUEST', message: '用户强平控制仅支持37号账本' });
  if (!validId(input.userId)) throw new TRPCError({ code: 'UNAUTHORIZED', message: '缺少真实操作者身份' });
  const extra = input as unknown as Record<string, unknown>;
  if (extra.actorUserId !== undefined || extra.viewAsUserId !== undefined) throw new TRPCError({ code: 'FORBIDDEN', message: '不能指定其他操作者或代看身份' });
  const conn = await getDbConnection();
  if (!conn) fail('数据库连接不可用');
  const owner = await rows(conn, 'SELECT id,ownerId FROM ledgers WHERE id=? LIMIT 1', [37]);
  if (owner.length !== 1 || Number(owner[0].id) !== 37 || Number(owner[0].ownerId) !== input.userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅37号账本实际所有者可以查看或维护用户强平控制' });
  }
  return conn;
}
function option(row: any): ForcedLiquidationUserOption {
  const userId = numeric(row.userId);
  if (!validId(userId) || Number(row.ledgerId) !== 37 || row.memberType !== 'real' || Number(row.realUserId) !== userId) fail('真实成员范围异常');
  const displayName = [row.nickname, row.name, row.username].find(value => typeof value === 'string' && value.trim());
  return { userId, displayName: displayName?.trim() || `用户 #${userId}`, username: typeof row.username === 'string' ? row.username : '' };
}
const MEMBER_COLUMNS = 'm.userId,m.ledgerId,m.member_type AS memberType,m.nickname,u.id AS realUserId,u.name,u.username';
/** Minimum real-member directory; no phone, avatar, wallet, roles, or initial settings are returned. */
export async function getForcedLiquidationUsers(input: Input): Promise<{ ledgerId: 37; users: ForcedLiquidationUserOption[] }> {
  const conn = await authorize(input);
  const members = await rows(conn, `SELECT ${MEMBER_COLUMNS} FROM ledger_members m INNER JOIN users u ON u.id=m.userId
    WHERE m.ledgerId=? AND m.member_type='real' ORDER BY m.id`, [37]);
  const users = members.map(option);
  if (new Set(users.map(user => user.userId)).size !== users.length) fail('真实成员身份重复，不能指定用户强平控制');
  return { ledgerId: 37, users };
}
function balancesOf(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === '') return {};
  if (typeof raw !== 'string') fail('成员实际参与设置格式异常');
  try { const value: unknown = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
  catch { return fail('成员实际参与设置损坏，不推测其参与范围'); }
}
/** Reporting only: malformed dates or entry during a pause are not a valid zero-profit interval. */
export function userOrdinaryProfitIntervalNotice(balances: Record<string, unknown>, name: string): string | null {
  // Member settings are business-date inputs, not record timestamps. Never let Date normalize
  // an impossible ISO date, or accept a SQL-style string with invalid hours as a valid setting.
  const memberDate = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? ordinaryTagDownsideBusinessDate(value) : null;
  const entry = memberDate(balances[`${name}__startDate`]);
  if (!entry) return '本人开始日期缺失或异常，获利待核验，不按0统计';
  const endRaw = balances[`${name}__endDate`];
  const hasEnd = endRaw !== undefined && endRaw !== null && endRaw !== '';
  const end = hasEnd ? memberDate(endRaw) : null;
  if (hasEnd && (!end || end < entry)) return '本人结束日期异常或早于开始日期，获利待核验，不按0统计';
  const historyRaw = balances[`${name}__pauseHistory`];
  let periods: unknown[] = [];
  if (historyRaw !== undefined && historyRaw !== null && historyRaw !== '') {
    try {
      const parsed: unknown = typeof historyRaw === 'string' ? JSON.parse(historyRaw) : historyRaw;
      if (!Array.isArray(parsed)) throw new Error('invalid pause history');
      periods = parsed; // Valid [] deliberately overrides a stale legacy pause date.
    } catch { return '本人暂停历史异常，获利待核验，不按0统计'; }
  } else {
    const pause = balances[`${name}__pauseDate`];
    if (pause !== undefined && pause !== null && pause !== '') periods = [{ pauseDate: pause }];
  }
  for (const raw of periods) {
    if (!raw || typeof raw !== 'object') return '本人暂停历史异常，获利待核验，不按0统计';
    const period = raw as Record<string, unknown>;
    const pause = memberDate(period.pauseDate);
    const hasResume = period.resumeDate !== undefined && period.resumeDate !== null && period.resumeDate !== '';
    const resume = hasResume ? memberDate(period.resumeDate) : null;
    if (!pause || (hasResume && (!resume || resume <= pause))) return '本人暂停或恢复日期异常，获利待核验，不按0统计';
    if (pause < entry && (!resume || entry < resume)) return '本人暂停日期早于开始日期或开始日在暂停区间内，获利待核验，不按0统计';
  }
  return null;
}
async function readLifecycle(conn: any): Promise<any[]> {
  try { return await rows(conn, 'SELECT ledger_id,tag_name,pause_date,margin_pause_date,end_date FROM ledger_tag_config WHERE ledger_id=?', [37]); }
  catch (error: any) {
    if (missingTable(error)) return [];
    if ((error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054)
      && /^Unknown column ['`](?:ledger_tag_config\.)?end_date['`] in ['`]field list['`]/i.test(error?.sqlMessage ?? error?.message ?? '')) {
      return rows(conn, 'SELECT ledger_id,tag_name,pause_date,margin_pause_date FROM ledger_tag_config WHERE ledger_id=?', [37]);
    }
    throw error;
  }
}
export function userImpactLifecycle(config: any, today: string): 'active' | 'paused' | 'ended' {
  const effective = (value: unknown) => { const date = ordinaryTagDownsideBusinessDate(value); return date !== null && date <= today; };
  return effective(config?.end_date) ? 'ended' : effective(config?.margin_pause_date ?? config?.pause_date) ? 'paused' : 'active';
}
function summary(amount: number | null, currency: 'CNY' | 'USD' | 'USDT', fx: ForcedLiquidationCnyFx | null, now: number) {
  // Reuse exact list display cents/FX validation, without introducing a new accounting conversion.
  return forcedLiquidationDetailSummary({ status: amount === null ? 'pending' : 'ready', ineffectiveFunds: amount,
    currency, notice: null } as ForcedLiquidationSettingDetail, fx, now);
}
export function sumUserImpactCny(lines: readonly { ineffectiveFundsCny: number | null; status: string }[]): number | null {
  if (!lines.length) return 0;
  const result = aggregateForcedLiquidationStockSummaries(lines.map(line => ({ ineffectiveFundsCny: line.ineffectiveFundsCny,
    ineffectiveCnyStatus: line.status === 'ready' ? 'ready' : 'pending' })));
  return result.ineffectiveCnyStatus === 'ready' ? result.ineffectiveFundsCny ?? null : null;
}
/** Display only: raw profit is the rounding anchor, counted uses the already-rounded impact.
 * Both underlying profits must have independently complete evidence. This conserves every existing
 * per-line impact cent and guarantees the three displayed totals reconcile, without changing money.
 */
export function reconcileUserProfitCny(raw: number | null, counted: number | null, impactCny: number | null, now: number): {
  rawPnlCny: number | null; countedPnlCny: number | null;
} {
  const pending = { rawPnlCny: null, countedPnlCny: null };
  if (raw === null || counted === null || !Number.isFinite(raw) || !Number.isFinite(counted) || impactCny === null) return pending;
  const rawPnlCny = summary(raw, 'CNY', null, now).ineffectiveFundsCny ?? null;
  const proofCounted = summary(counted, 'CNY', null, now).ineffectiveFundsCny ?? null;
  if (rawPnlCny === null || proofCounted === null) return pending;
  const countedPnlCny = sumUserImpactCny([{ ineffectiveFundsCny: rawPnlCny, status: 'ready' }, { ineffectiveFundsCny: -impactCny, status: 'ready' }]);
  if (countedPnlCny === null || Math.abs(countedPnlCny - counted) > 0.01000001) return pending;
  return { rawPnlCny, countedPnlCny };
}
export function totalUserProfitsCny(lines: readonly Pick<ForcedLiquidationUserImpactLine, 'rawPnlCny' | 'countedPnlCny' | 'ineffectiveFundsCny'>[]): {
  totalRawPnlCny: number | null; totalCountedPnlCny: number | null; profitPendingCount: number;
} {
  const valid = (line: typeof lines[number]) => line.rawPnlCny != null && line.countedPnlCny != null && line.ineffectiveFundsCny != null
    && sumUserImpactCny([{ ineffectiveFundsCny: line.rawPnlCny, status: 'ready' }, { ineffectiveFundsCny: -line.countedPnlCny, status: 'ready' }]) === line.ineffectiveFundsCny;
  const profitPendingCount = lines.filter(line => !valid(line)).length;
  if (profitPendingCount) return { totalRawPnlCny: null, totalCountedPnlCny: null, profitPendingCount };
  const totalRawPnlCny = sumUserImpactCny(lines.map(line => ({ ineffectiveFundsCny: line.rawPnlCny ?? null, status: line.rawPnlCny == null ? 'pending' : 'ready' })));
  const totalCountedPnlCny = sumUserImpactCny(lines.map(line => ({ ineffectiveFundsCny: line.countedPnlCny ?? null, status: line.countedPnlCny == null ? 'pending' : 'ready' })));
  return { totalRawPnlCny, totalCountedPnlCny, profitPendingCount };
}
/** Owner-approved partial display: include only whole, fully verified categories.
 * All-tag impact is passed independently and is never replaced with the partial subtotal.
 */
export function verifiedUserProfitsCny(categories: readonly ForcedLiquidationUserImpactCategory[], totalImpactCny: number | null): Pick<ForcedLiquidationUserImpact,
  'totalRawPnlCny' | 'totalCountedPnlCny' | 'profitPendingCount' | 'profitScope' | 'excludedProfitCategories' | 'verifiedProfitImpactCny' | 'profitImpactMatchesTotal'> {
  const included: ForcedLiquidationUserImpactCategory[] = [];
  const excludedProfitCategories: ForcedLiquidationUserImpact['excludedProfitCategories'] = [];
  let profitPendingCount = 0;
  for (const category of categories) {
    const profits = totalUserProfitsCny(category.lines);
    if (category.participationStatus !== 'pending' && category.status === 'ready'
      && profits.totalRawPnlCny !== null && profits.totalCountedPnlCny !== null) included.push(category);
    else {
      profitPendingCount += Math.max(1, profits.profitPendingCount);
      const missingNotices = category.lines.filter(line => line.rawPnlCny == null || line.countedPnlCny == null).map(line => line.notice).filter(Boolean);
      excludedProfitCategories.push({ categoryId: category.categoryId, categoryName: category.categoryName, lineCount: category.lines.length,
        notice: Array.from(new Set([category.notice, ...missingNotices].filter(Boolean))).join('；') || '本人累计获利或人民币折算证据待核验，整标签未计入获利总计' });
    }
  }
  const profitScope = excludedProfitCategories.length ? 'verified_only' : 'complete';
  const hasVerifiedScope = profitScope === 'complete' || included.some(category => category.participationStatus === 'participating' && category.lines.length > 0);
  const profits = hasVerifiedScope ? totalUserProfitsCny(included.flatMap(category => category.lines)) : { totalRawPnlCny: null, totalCountedPnlCny: null };
  const verifiedProfitImpactCny = hasVerifiedScope && profits.totalRawPnlCny !== null && profits.totalCountedPnlCny !== null ? sumUserImpactCny(included) : null;
  const displayDifference = profits.totalRawPnlCny !== null && profits.totalCountedPnlCny !== null
    ? sumUserImpactCny([{ ineffectiveFundsCny: profits.totalRawPnlCny, status: 'ready' }, { ineffectiveFundsCny: -profits.totalCountedPnlCny, status: 'ready' }]) : null;
  return { totalRawPnlCny: profits.totalRawPnlCny, totalCountedPnlCny: profits.totalCountedPnlCny, profitPendingCount, profitScope,
    excludedProfitCategories, verifiedProfitImpactCny,
    profitImpactMatchesTotal: displayDifference !== null && displayDifference === verifiedProfitImpactCny && displayDifference === totalImpactCny };
}
function baseLine(p: any): ForcedLiquidationUserImpactLine {
  return { kind: 'stock', participationId: numeric(p.id), lotId: numeric(p.lot_id), symbol: p.symbol,
    stockName: typeof p.stock_name === 'string' ? p.stock_name : null, quantity: numeric(p.remaining_quantity),
    entryDate: ordinaryTagDownsideBusinessDate(p.start_date), latestDate: null, currency: portfolioCurrency(p.symbol),
    rawPnl: null, countedPnl: null, rawPnlCny: null, countedPnlCny: null, ineffectiveFunds: null, ineffectiveFundsCny: null, status: 'pending', notice: '真实参与、行情或规则证据待核验' };
}
/** Pure member PnL reconciliation. No global quantity/ratio, network, cache or stored-funds mutation. */
export function buildUserStockImpact(input: { participation: any; closures: readonly any[]; rules: readonly StockLotDownsideRule[];
  epochs: readonly StockLotDownsideMemberEpoch[]; quotes: readonly ForcedLiquidationStockQuote[];
  historicalQuotes: readonly { symbol: string; price: number; priceDate: string; quoteAsOf: string; verified: boolean }[];
  savedSales: readonly any[]; exempt: boolean; now: number; fx: ForcedLiquidationCnyFx | null; locks: ReadonlyMap<number, any> }): ForcedLiquidationUserImpactLine {
  const p = input.participation, line = baseLine(p);
  const entry = numeric(p.entry_price), allocated = numeric(p.allocated_quantity), remaining = numeric(p.remaining_quantity);
  const assigned = wall(p.assigned_at), opened = wall(p.actual_traded_at);
  const start = ordinaryTagDownsideBusinessDate(p.start_date) ?? opened?.slice(0, 10) ?? null;
  line.entryDate = start;
  const today = new Date(input.now + 8 * 3600_000).toISOString().slice(0, 10);
  const invalid = (notice: string) => ({ ...line, notice });
  if (!parsePortfolioInstrument(p.symbol)) return invalid('资产标识或币种无法核验，不使用人民币默认值换算');
  if (!validId(line.participationId) || !validId(line.lotId) || !entry || entry <= 0 || allocated === null || allocated < 0
    || remaining === null || remaining < 0 || remaining > allocated || !assigned || !opened || !start
    || Date.parse(opened) > input.now || Date.parse(assigned) > input.now || start > today) return invalid('实际参与价格、开始时间或数量不完整/尚未生效');
  if (isCryptoPortfolioSymbol(p.symbol) && ((allocated !== 0 && !isValidCryptoPortfolioQuantity(allocated))
    || (remaining !== 0 && !isValidCryptoPortfolioQuantity(remaining)))) return invalid('实际币数精度或数量证据无效');
  if (p.allocation_valid === false) return invalid('本人余量与全批次真实可分配数量不一致或证据缺失');
  const entryAt = stockLotDownsideMemberEntryAt(assigned, start);
  const rules = input.exempt ? [] : input.rules;
  const offset = (at: string): number | null => {
    if (input.exempt) return 0;
    const entryRule = selectStockLotDownsideRule(rules, line.lotId!, entryAt);
    const proof = stockLotDownsideHistoricalEntryProof(p.symbol, entryAt, input.historicalQuotes, new Date(input.now));
    const isOpening = Date.parse(opened) === Date.parse(entryAt);
    return stockLotDownsideMemberOffset({ lotId: line.lotId!, participationId: line.participationId!, assignedAt: assigned,
      startDate: start, rules, epochs: input.epochs, asOf: at, participationAsOf: new Date(input.now),
      entryRawPrice: entryRule?.baselineSource === 'owner_threshold' ? entry : isOpening ? numeric(p.unit_cost) : proof?.price,
      entryQuoteAsOf: isOpening ? opened : proof?.quoteAsOf });
  };
  let closedQuantity = 0, rawClosed = 0, countedClosed = 0, closedCnyImpact = 0;
  let rawClosedCny = 0, countedClosedCny = 0, closedProfitVerified = true;
  for (const c of input.closures) {
    const quantity = numeric(c.quantity), price = numeric(c.sale_price), at = wall(c.actual_traded_at);
    if (quantity === null || quantity <= 0 || price === null || price <= 0 || !at || Date.parse(at) > input.now
      || Date.parse(at) < Date.parse(entryAt)) return invalid('实际退出数量、价格或成交时间证据缺失/冲突');
    const rule = selectStockLotDownsideRule(rules, line.lotId!, at);
    const saved = input.savedSales.find(s => Number(s.lot_id) === line.lotId && Number(s.sell_event_id) === Number(c.sell_event_id));
    const counted = input.exempt ? price : rule?.startDate ? countedStockLotPrice(price, rule)
      : saved ? numeric(saved.counted_price) : price;
    const carry = offset(at);
    if (counted === null || carry === null) return invalid('历史退出的强平或入场证明待核验，不能以原始收益代替');
    const raw = quantity * (entry - price), countedPnl = quantity * (entry - (counted - carry));
    closedQuantity += quantity; rawClosed += raw; countedClosed += countedPnl;
    let rate: number | null = 1;
    if (isR1StockSaleFxScope(37, Number(p.category_id)) && line.currency !== 'CNY') {
      const lock = input.locks.get(Number(c.sell_event_id));
      rate = validateStockSaleFxLock(lock, { eventId: Number(c.sell_event_id), categoryId: Number(p.category_id), currency: line.currency }) ? lock.cnyRate : null;
    } else if (line.currency !== 'CNY') {
      const converted = summary(raw - countedPnl, line.currency, input.fx, input.now);
      rate = converted.ineffectiveCnyFx?.rate ?? null;
    }
    if (!input.exempt && rate === null && raw !== countedPnl) return invalid('历史外币影响缺少原有冻结汇率或有效汇率证据');
    closedCnyImpact += (raw - countedPnl) * (rate ?? 0);
    if (rate === null && (raw !== 0 || countedPnl !== 0)) closedProfitVerified = false;
    else { rawClosedCny += raw * (rate ?? 0); countedClosedCny += countedPnl * (rate ?? 0); }
    line.latestDate = at.slice(0, 10);
  }
  if (Math.abs(allocated - remaining - closedQuantity) > 1e-7) return invalid('当前实际余量与完整退出记录不一致，不推测退出份额');
  let rawOpen = 0, countedOpen = 0;
  if (remaining > 0) {
    const pauseRaw = p.pause_date;
    const pause = ordinaryTagDownsideBusinessDate(pauseRaw);
    if (pauseRaw !== null && pauseRaw !== undefined && pauseRaw !== '' && !pause) return invalid('成员本批次暂停日期损坏');
    const candidates = input.quotes.filter(q => !pause || pause > today || (q.priceDate <= pause && !q.source.endsWith(':intraday')));
    const quote = chooseLatestStockQuote(candidates, p.symbol);
    if (!quote || quote.price === null || Date.parse(quote.updatedAt) > input.now) {
      if (input.exempt || !rules.some(r => r.lotId === line.lotId && Date.parse(r.effectiveAt) <= input.now)) {
        return { ...line, ineffectiveFunds: input.exempt ? 0 : rawClosed - countedClosed,
          ineffectiveFundsCny: input.exempt ? 0 : summary(closedCnyImpact, 'CNY', null, input.now).ineffectiveFundsCny ?? null,
          status: 'ready', notice: '该用户本批次未受强平影响；缺少行情时不伪造原始或计入收益' };
      }
      return invalid('缺少实际持仓的有效最新价或暂停日价，不回退开仓价');
    }
    const at = pause && pause <= today ? stockLotDownsidePriceAsOf(p.symbol, quote.priceDate) : new Date(input.now).toISOString();
    const rule = selectStockLotDownsideRule(rules, line.lotId!, at), price = input.exempt ? quote.price : countedStockLotPrice(quote.price, rule);
    const carry = offset(at);
    if (price === null || carry === null) return invalid('强平计价或本人实际入场抵消证据缺失');
    rawOpen = remaining * (entry - quote.price); countedOpen = remaining * (entry - (price - carry));
    line.latestDate = quote.priceDate;
  }
  const raw = rawOpen + rawClosed, counted = countedOpen + countedClosed, impact = raw - counted;
  if (![raw, counted, impact, closedCnyImpact].every(Number.isFinite)) return invalid('本人收益或影响金额溢出');
  let openCnyImpact = 0;
  if (!input.exempt && rawOpen !== countedOpen) {
    const converted = summary(rawOpen - countedOpen, line.currency, input.fx, input.now);
    if (converted.ineffectiveCnyStatus !== 'ready') return { ...line, rawPnl: raw, countedPnl: counted, ineffectiveFunds: impact, notice: converted.ineffectiveCnyNotice ?? '人民币折算待核验' };
    // Keep unrounded native conversion until this participation's final display rounding.
    openCnyImpact = (rawOpen - countedOpen) * (line.currency === 'CNY' ? 1 : converted.ineffectiveCnyFx!.rate);
  }
  const cny = summary(input.exempt ? 0 : openCnyImpact + closedCnyImpact, 'CNY', null, input.now);
  const openRate = line.currency === 'CNY' ? 1 : summary(0, line.currency, input.fx, input.now).ineffectiveCnyFx?.rate ?? null;
  const openProfitVerified = openRate !== null || (rawOpen === 0 && countedOpen === 0);
  const profits = reconcileUserProfitCny(closedProfitVerified && openProfitVerified ? rawClosedCny + rawOpen * (openRate ?? 0) : null,
    closedProfitVerified && openProfitVerified ? countedClosedCny + countedOpen * (openRate ?? 0) : null,
    cny.ineffectiveFundsCny ?? null, input.now);
  return { ...line, rawPnl: raw, countedPnl: counted, ineffectiveFunds: impact === 0 ? 0 : impact,
    ...profits,
    ineffectiveFundsCny: cny.ineffectiveFundsCny ?? null, status: cny.ineffectiveCnyStatus === 'ready' ? 'ready' : 'pending',
    notice: input.exempt ? '用户级不受强平影响：全部历史与累计按原始口径，影响为0；原成交与已支付不变'
      : '按本人真实入场、剩余份额及各笔退出计算原始累计收益减计入累计收益；R1历史外币退出保留原冻结汇率' };
}

/** Owner-only SELECT-only member reconciliation. No portfolio/server bootstrap or pricing scanners. */
export async function getForcedLiquidationUserImpact(input: Input & { targetUserId: number }): Promise<ForcedLiquidationUserImpact> {
  if (!validId(input.targetUserId)) throw new TRPCError({ code: 'BAD_REQUEST', message: '请选择有效的真实用户' });
  const conn = await authorize(input);
  const members = await rows(conn, `SELECT ${MEMBER_COLUMNS},m.initial_balances AS initialBalances
    FROM ledger_members m INNER JOIN users u ON u.id=m.userId WHERE m.ledgerId=? AND m.userId=? AND m.member_type='real' LIMIT 2`, [37, input.targetUserId]);
  if (members.length !== 1) throw new TRPCError({ code: 'FORBIDDEN', message: '目标用户不是37号账本唯一真实成员' });
  const target = option(members[0]), balances = balancesOf(members[0].initialBalances);
  if (target.userId !== input.targetUserId) fail('目标成员范围不匹配');
  let now = Date.now();
  const today = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  const mysqlNow = new Date(now + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  const categories: Category[] = await rows(conn, `SELECT id,ledgerId,name,parentId,isDefault,accounting_mode AS accountingMode
    FROM ledger_categories WHERE ledgerId=? AND parentId IS NULL AND isDefault=0
      AND accounting_mode IN ('stock_portfolio','manual_balance') ORDER BY sortOrder,id`, [37]);
  if (categories.some(c => !validId(Number(c.id)) || Number(c.ledgerId) !== 37 || c.parentId !== null || Number(c.isDefault) !== 0
    || !['stock_portfolio', 'manual_balance'].includes(c.accountingMode) || typeof c.name !== 'string' || !c.name.trim())) fail('用户强平统计标签范围异常');
  if (new Set(categories.map(c => Number(c.id))).size !== categories.length || new Set(categories.map(c => c.name)).size !== categories.length) fail('标签身份或名称重复，不能推测成员配置映射');
  const lifecycleRows = await readLifecycle(conn);
  if (lifecycleRows.some(c => Number(c.ledger_id) !== 37 || typeof c.tag_name !== 'string')
    || new Set(lifecycleRows.map(c => c.tag_name)).size !== lifecycleRows.length) fail('全局标签状态范围异常');
  const lifecycleByName = new Map(lifecycleRows.map(c => [c.tag_name, c]));
  const overrides = await readUserTagDownsideOverrides(conn, 37, input.targetUserId);
  const stockRules = await readAllStockLotDownsideRules(conn, 37);
  const ordinaryRules = await readAllOrdinaryTagDownsideRules(conn, 37);
  const stockIds = new Set(categories.filter(c => c.accountingMode === 'stock_portfolio').map(c => Number(c.id)));
  const participations = stockIds.size ? await rows(conn, `SELECT p.id,p.ledger_id,p.category_id,p.user_id,p.lot_id,p.allocated_quantity,p.remaining_quantity,p.entry_price,
      DATE_FORMAT(p.start_date,'%Y-%m-%d') AS start_date,DATE_FORMAT(p.pause_date,'%Y-%m-%d') AS pause_date,
      DATE_FORMAT(p.assigned_at,'%Y-%m-%d %H:%i:%s') AS assigned_at,l.symbol,l.stock_name,l.unit_cost,
      DATE_FORMAT(opening.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at,
      COALESCE(l.note,opening.note,'') AS note
    FROM ledger_stock_lot_participations p
    INNER JOIN ledger_stock_lots l ON l.id=p.lot_id AND l.ledger_id=p.ledger_id AND l.category_id=p.category_id
    INNER JOIN ledger_categories c ON c.id=p.category_id AND c.ledgerId=p.ledger_id AND c.parentId IS NULL AND c.isDefault=0 AND c.accounting_mode='stock_portfolio'
    INNER JOIN ledger_stock_events opening ON opening.id=l.opened_event_id AND opening.ledger_id=l.ledger_id AND opening.category_id=l.category_id
      AND opening.symbol=l.symbol AND opening.status='active' AND opening.event_type IN ('buy','add')
    WHERE p.ledger_id=? AND p.user_id=? AND p.allocated_quantity>0 ORDER BY p.category_id,l.opened_at,p.id`, [37, input.targetUserId]) : [];
  if (participations.some(p => Number(p.ledger_id) !== 37 || Number(p.user_id) !== input.targetUserId || !stockIds.has(Number(p.category_id))
    || !validId(Number(p.id)) || !validId(Number(p.lot_id)) || typeof p.symbol !== 'string')) fail('股票实际参与范围异常');
  if (new Set(participations.map(p => Number(p.id))).size !== participations.length) fail('本人实际参与记录重复');
  const lotIds = Array.from(new Set(participations.map(p => Number(p.lot_id))));
  const allocations = lotIds.length ? await rows(conn, `SELECT l.id AS lot_id,l.ledger_id,l.category_id,l.initial_quantity,
      COALESCE((SELECT SUM(a.quantity) FROM ledger_stock_event_lot_allocations a INNER JOIN ledger_stock_events e ON e.id=a.event_id
        AND e.ledger_id=l.ledger_id AND e.category_id=l.category_id AND e.symbol=l.symbol AND e.status='active'
        AND e.event_type IN ('sell','reduce') AND e.actual_traded_at<=? WHERE a.lot_id=l.id),0) AS sold_quantity,
      COALESCE((SELECT SUM(p.remaining_quantity) FROM ledger_stock_lot_participations p WHERE p.ledger_id=l.ledger_id
        AND p.category_id=l.category_id AND p.lot_id=l.id),0) AS member_remaining
    FROM ledger_stock_lots l WHERE l.ledger_id=? AND l.id IN (${lotIds.map(() => '?').join(',')}) ORDER BY l.id`, [mysqlNow, 37, ...lotIds]) : [];
  for (const p of participations) {
    const matching = allocations.filter(a => Number(a.lot_id) === Number(p.lot_id) && Number(a.ledger_id) === 37 && Number(a.category_id) === Number(p.category_id));
    const a = matching[0], initial = numeric(a?.initial_quantity), sold = numeric(a?.sold_quantity), membersRemaining = numeric(a?.member_remaining);
    p.allocation_valid = matching.length === 1 && initial !== null && initial > 0 && sold !== null && sold >= 0 && sold <= initial
      && membersRemaining !== null && membersRemaining >= 0 && membersRemaining <= initial - sold + 1e-7
      && numeric(p.remaining_quantity) !== null && Number(p.remaining_quantity) <= initial - sold + 1e-7;
  }
  const closures = participations.length ? await rows(conn, `SELECT p.id AS participation_id,p.ledger_id,p.category_id,p.user_id,p.lot_id,c.sell_event_id,c.quantity,c.sale_price,
      DATE_FORMAT(e.actual_traded_at,'%Y-%m-%d %H:%i:%s') AS actual_traded_at
    FROM ledger_stock_participation_closures c INNER JOIN ledger_stock_lot_participations p ON p.id=c.participation_id
    INNER JOIN ledger_stock_lots l ON l.id=p.lot_id AND l.ledger_id=p.ledger_id AND l.category_id=p.category_id
    INNER JOIN ledger_stock_events e ON e.id=c.sell_event_id AND e.ledger_id=p.ledger_id AND e.category_id=p.category_id AND e.symbol=l.symbol
      AND e.status='active' AND e.event_type IN ('sell','reduce')
    WHERE p.ledger_id=? AND p.user_id=? AND e.actual_traded_at<=? ORDER BY p.id,e.actual_traded_at,c.id`, [37, input.targetUserId, mysqlNow]) : [];
  if (closures.some(c => Number(c.ledger_id) !== 37 || Number(c.user_id) !== input.targetUserId
    || !participations.some(p => Number(p.id) === Number(c.participation_id) && Number(p.lot_id) === Number(c.lot_id) && Number(p.category_id) === Number(c.category_id)))) fail('股票退出记录范围异常');
  let epochs: StockLotDownsideMemberEpoch[] = [], sales: any[] = [];
  if (participations.length && stockRules.length) {
    try {
      const found = await rows(conn, `SELECT ledger_id,category_id,lot_id,participation_id,user_id,raw_price,counted_price,entry_counted_offset,
        DATE_FORMAT(effective_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS effective_at FROM ledger_stock_lot_downside_member_epochs WHERE ledger_id=? AND user_id=?`, [37, input.targetUserId]);
      epochs = found.map(e => ({ ledgerId: Number(e.ledger_id), categoryId: Number(e.category_id), lotId: Number(e.lot_id), participationId: Number(e.participation_id),
        userId: Number(e.user_id), rawPrice: numeric(e.raw_price) ?? NaN, countedPrice: numeric(e.counted_price) ?? NaN,
        entryCountedOffset: numeric(e.entry_counted_offset) ?? NaN, effectiveAt: typeof e.effective_at === 'string' ? e.effective_at : '' }));
      if (epochs.some(e => e.ledgerId !== 37 || e.userId !== input.targetUserId || !participations.some(p => Number(p.id) === e.participationId && Number(p.lot_id) === e.lotId))) fail('股票入场证明范围异常');
    } catch (e) { if (!missingTable(e)) throw e; }
    if (closures.length) {
      try { sales = await rows(conn, `SELECT ledger_id,category_id,lot_id,sell_event_id,raw_price,counted_price,
        DATE_FORMAT(effective_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS effective_at FROM ledger_stock_lot_downside_sales WHERE ledger_id=?
        AND (${closures.map(() => '(category_id=? AND lot_id=? AND sell_event_id=?)').join(' OR ')})`, [37, ...closures.flatMap(c => [Number(c.category_id), Number(c.lot_id), Number(c.sell_event_id)])]); }
      catch (e) { if (!missingTable(e)) throw e; }
      if (sales.some(s => Number(s.ledger_id) !== 37 || !closures.some(c => Number(c.lot_id) === Number(s.lot_id) && Number(c.sell_event_id) === Number(s.sell_event_id) && Number(c.category_id) === Number(s.category_id)))) fail('股票强平退出证明范围异常');
    }
  }
  const quotesByKey = new Map<string, ForcedLiquidationStockQuote[]>();
  const historicalQuotes: Array<{ symbol: string; price: number; priceDate: string; quoteAsOf: string; verified: boolean; categoryId: number }> = [];
  const pairs = Array.from(new Map(participations.map(p => [JSON.stringify([Number(p.category_id), p.symbol]), { categoryId: Number(p.category_id), symbol: p.symbol }])).values());
  if (pairs.length) for (const table of ['ledger_stock_price_snapshots', 'ledger_stock_intraday_quotes', 'ledger_stock_unified_close_prices']) {
    let found: any[] = [];
    // Intraday rows are continuously upserted. A request-start captured_at upper bound can
    // remove every crypto row while this request is still reading. Read current scoped rows,
    // then validate against the real read-completion time; historical proof keeps its old bound.
    const liveTable = table === 'ledger_stock_intraday_quotes';
    try { found = await rows(conn, `SELECT ledger_id,category_id,symbol,price,${table === 'ledger_stock_unified_close_prices' ? "DATE_FORMAT(session_date,'%Y-%m-%d')" : "DATE_FORMAT(price_date,'%Y-%m-%d')"} AS price_date,
      DATE_FORMAT(captured_at,'%Y-%m-%d %H:%i:%s.%f') AS captured_at${table === 'ledger_stock_unified_close_prices' ? ',source' : ''}
      FROM ${table} WHERE ledger_id=? AND (${pairs.map(() => '(category_id=? AND symbol=?)').join(' OR ')})
      AND ${table === 'ledger_stock_unified_close_prices' ? 'session_date' : 'price_date'}<=?${liveTable ? '' : ' AND captured_at<=?'} ORDER BY captured_at`, [37, ...pairs.flatMap(p => [p.categoryId, p.symbol]), today, ...(liveTable ? [] : [mysqlNow])]); }
    catch (e) { if (!missingTable(e)) throw e; }
    now = Math.max(now, Date.now());
    if (new Date(now + 8 * 3600_000).toISOString().slice(0, 10) !== today) {
      throw new TRPCError({ code: 'CONFLICT', message: '统计读取跨越业务日期，请刷新后按同一天重算' });
    }
    for (const pair of pairs) {
      const key = JSON.stringify([pair.categoryId, pair.symbol]);
      const decoded = decodeForcedLiquidationStockQuotes(found, pair.categoryId, pair.symbol, table, table === 'ledger_stock_intraday_quotes' ? 'intraday' : 'close', now);
      quotesByKey.set(key, [...(quotesByKey.get(key) ?? []), ...decoded]);
      if (table !== 'ledger_stock_intraday_quotes') for (const quote of decoded) {
        const raw = found.find(q => Number(q.category_id) === pair.categoryId && q.symbol === pair.symbol && wall(q.captured_at) === quote.updatedAt);
        const source = table === 'ledger_stock_unified_close_prices' ? raw?.source ?? '' : 'price_snapshot';
        historicalQuotes.push({ categoryId: pair.categoryId, symbol: pair.symbol, price: quote.price ?? NaN, priceDate: quote.priceDate,
          quoteAsOf: quote.updatedAt, verified: quote.price !== null && isTrustedMemberCalendarClose({ symbol: pair.symbol, price: quote.price, priceDate: quote.priceDate, capturedAt: quote.updatedAt, source }) });
      }
    }
  }
  const lotProofs = participations.map(p => ({ lotId: Number(p.lot_id), symbol: p.symbol, openedAt: wall(p.actual_traded_at) ?? '', unitCost: numeric(p.unit_cost) ?? NaN }));
  const r1Closures = closures.filter(c => isR1StockSaleFxScope(37, Number(c.category_id)));
  const locks = await readStockSaleFxLocks(conn, { ledgerId: 37, categoryId: 90250, eventIds: r1Closures.map(c => Number(c.sell_event_id)) });
  let fx: ForcedLiquidationCnyFx | null = null;
  if (participations.some(p => parsePortfolioInstrument(p.symbol) && portfolioCurrency(p.symbol) !== 'CNY')) {
    try { fx = await getLiveStockUsdCnyQuote(); } catch { /* No native or stale fallback. */ }
  }
  const ordinaryIds = categories.filter(c => {
    if (c.accountingMode !== 'manual_balance') return false;
    const initial = balances[c.name], start = balances[`${c.name}__startDate`], observation = balances[ordinaryTagObservationKey(c.name)];
    // A default zero JSON key is not proof of actual membership in this tag. Keep nonzero/corrupt
    // configured inputs visible for validation, and permit a real dated zero-reference participation.
    return (start != null && start !== '') || (initial != null && initial !== '' && numeric(initial) !== 0)
      || (numeric(balances[`${c.name}__targetAmount`]) ?? 0) > 0 || (observation != null && observation !== '');
  }).map(c => Number(c.id));
  const ordinaryRecords = ordinaryIds.length ? await rows(conn, `SELECT r.ledgerId,COALESCE(c.parentId,c.id) AS categoryId,DATE_FORMAT(r.recordDate,'%Y-%m-%d') AS recordDate,
      r.type,r.amount,r.id AS recordId,DATE_FORMAT(r.createdAt,'%Y-%m-%d %H:%i:%s.%f') AS createdAt,
      CASE WHEN r.type='transfer' THEN r.description ELSE NULL END AS description,r.deleted_at AS deletedAt
    FROM ledger_records r INNER JOIN ledger_categories c ON c.id=r.categoryId AND c.ledgerId=r.ledgerId
    WHERE r.ledgerId=? AND (c.id IN (${ordinaryIds.map(() => '?').join(',')}) OR c.parentId IN (${ordinaryIds.map(() => '?').join(',')}))
      AND r.deleted_at IS NULL AND r.recordDate<=? ORDER BY r.recordDate,r.createdAt,r.id`, [37, ...ordinaryIds, ...ordinaryIds, today]) : [];
  if (ordinaryRecords.some(r => Number(r.ledgerId) !== 37 || !ordinaryIds.includes(Number(r.categoryId)) || r.deletedAt != null)) fail('普通标签真实流水范围异常');
  now = Math.max(now, Date.now());
  if (new Date(now + 8 * 3600_000).toISOString().slice(0, 10) !== today) {
    throw new TRPCError({ code: 'CONFLICT', message: '统计读取跨越业务日期，请刷新后按同一天重算' });
  }
  const resolvedByCategory = new Map<number, StockLotDownsideRule[]>();
  for (const id of Array.from(stockIds)) resolvedByCategory.set(id, resolveStockLotDownsideHistoricalRules({
    rules: stockRules.filter(r => r.categoryId === id), lots: lotProofs, quotes: historicalQuotes.filter(q => q.categoryId === id), now: new Date(now) }));
  const results: ForcedLiquidationUserImpactCategory[] = categories.map(category => {
    const categoryId = Number(category.id);
    const latest = overrides.filter(o => o.categoryId === categoryId && o.targetUserId === input.targetUserId).sort((a, b) => b.version - a.version)[0];
    const exempt = isUserTagDownsideExempt(overrides, input.targetUserId, categoryId);
    const rules = resolvedByCategory.get(categoryId) ?? [];
    const globalEnabled = category.accountingMode === 'stock_portfolio' ? Array.from(new Set(rules.map(r => r.lotId))).some(id => [...rules].filter(r => r.lotId === id).sort((a, b) => b.version - a.version)[0]?.enabled === true)
      : [...(ordinaryRules.get(categoryId) ?? [])].sort((a, b) => b.version - a.version)[0]?.enabled === true;
    let lines: ForcedLiquidationUserImpactLine[] = [];
    if (category.accountingMode === 'stock_portfolio') lines = participations.filter(p => Number(p.category_id) === categoryId).map(p => buildUserStockImpact({
      participation: p, closures: closures.filter(c => Number(c.participation_id) === Number(p.id)), rules, epochs: epochs.filter(e => e.categoryId === categoryId),
      quotes: quotesByKey.get(JSON.stringify([categoryId, p.symbol])) ?? [], historicalQuotes: historicalQuotes.filter(q => q.categoryId === categoryId),
      savedSales: sales, exempt, now, fx, locks }));
    else if (ordinaryIds.includes(categoryId)) {
      const observationRaw = balances[ordinaryTagObservationKey(category.name)];
      const observation = readOrdinaryTagObservationConfig(balances, category.name);
      const ratio = numeric(balances[`${category.name}__ratio`]);
      const observationConflict = observationRaw != null && observationRaw !== '' && (!observation || (observation.enabled && ratio !== 0));
      if (observation?.enabled && ratio === 0) return { categoryId, categoryName: category.name, accountingMode: category.accountingMode,
        lifecycleStatus: userImpactLifecycle(lifecycleByName.get(category.name), today), globalEnabled,
        override: { mode: latest?.mode ?? 'follow_tag', version: latest?.version ?? 0 }, participationStatus: 'none',
        ineffectiveFundsCny: 0, status: 'ready', notice: '此用户仅开启观察，不把观察参考份额当成真实参与收益', lines: [] };
      const intervalNotice = userOrdinaryProfitIntervalNotice(balances, category.name);
      const valuation = intervalNotice ? { status: 'pending' as const, points: [], totalPnl: null, latestDate: null } : buildOrdinaryTagDownsideValuation({ ledgerId: 37, userId: input.targetUserId, categoryId, categoryName: category.name,
        balances, records: ordinaryRecords.filter(r => Number(r.categoryId) === categoryId), rules: ordinaryRules.get(categoryId) ?? [], today,
        userTagDownsideOverrides: overrides });
      // Owner-confirmed reporting convention: a valid participation interval with no balance
      // observations has no reported win/loss. This changes only this statistics DTO, not the
      // canonical valuation, raw records, cashflows or money. Pending/invalid evidence stays null.
      const noDataZero = valuation.status === 'no_data' && valuation.points.length === 0;
      const profitReady = valuation.status === 'ready' || noDataZero;
      const last = valuation.points.at(-1), raw = noDataZero ? 0 : last?.rawPnl ?? null, counted = noDataZero ? 0 : valuation.totalPnl;
      const unaffected = exempt || !(ordinaryRules.get(categoryId)?.length);
      const amount = unaffected || noDataZero ? 0 : profitReady && raw !== null && counted !== null ? raw - counted : null;
      const converted = summary(amount, 'CNY', null, now);
      lines = [{ kind: 'ordinary', participationId: null, lotId: null, symbol: null, stockName: null, quantity: null,
        entryDate: ordinaryTagDownsideBusinessDate(balances[`${category.name}__startDate`]), latestDate: valuation.latestDate,
        currency: 'CNY', rawPnl: raw, countedPnl: counted, ineffectiveFunds: amount,
        ...reconcileUserProfitCny(profitReady ? raw : null, profitReady ? counted : null, converted.ineffectiveFundsCny ?? null, now),
        profitBasis: noDataZero ? 'no_data_zero' : 'recorded',
        ineffectiveFundsCny: converted.ineffectiveFundsCny ?? null, status: unaffected || noDataZero ? 'ready' : valuation.status,
        notice: noDataZero ? '本人参与区间内没有金额记录，按约定计0：没有报告获利或亏损；不表示账户余额归零，原账目与资金不变' : exempt ? '用户级不受强平影响：全部历史与累计按原始口径；原登记与已支付不变' : unaffected ? '此标签没有强平规则，影响为0；缺少参与收益证据时不伪造原始或计入收益' : '按本人实际参与日期、参考本金及比例，完整现金流中性重放，不以全局金额乘当前比例' }];
      const end = ordinaryTagDownsideBusinessDate(balances[`${category.name}__endDate`]);
      if (observationConflict || intervalNotice || (end && end <= today)) lines = lines.map(line => ({ ...line, rawPnl: null, countedPnl: null, rawPnlCny: null, countedPnlCny: null, profitBasis: undefined,
        ineffectiveFunds: unaffected && !observationConflict ? 0 : null, ineffectiveFundsCny: unaffected && !observationConflict ? 0 : null,
        status: unaffected && !observationConflict ? 'ready' : 'pending',
        notice: intervalNotice ?? (observationConflict ? '真实参与与观察配置冲突，不把观察收益当成实际收益'
          : '个人结束范围的历史比例证据待核验，不将结束后流水或当前比例伪装为历史累计收益') }));
    }
    const total = sumUserImpactCny(lines);
    return { categoryId, categoryName: category.name, accountingMode: category.accountingMode, lifecycleStatus: userImpactLifecycle(lifecycleByName.get(category.name), today), globalEnabled,
      override: { mode: latest?.mode ?? 'follow_tag', version: latest?.version ?? 0 }, participationStatus: lines.length ? 'participating' : 'none',
      ineffectiveFundsCny: total, status: total === null ? 'pending' : 'ready', notice: lines.length ? '' : '无该用户真实参与记录；不把账户自留或观察份额当成个人持仓', lines };
  });
  // Recheck user configuration after all bounded reads. A concurrent save must not mix old rules and new user mode.
  const after = await readUserTagDownsideOverrides(conn, 37, input.targetUserId);
  const fingerprint = (values: readonly UserTagDownsideOverride[]) => JSON.stringify(values.map(o => [o.categoryId, o.version, o.mode]).sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a[1]) - Number(b[1])));
  if (fingerprint(after) !== fingerprint(overrides)) throw new TRPCError({ code: 'CONFLICT', message: '用户强平设置在统计期间发生变化，请刷新后查看' });
  const [stockAfter, ordinaryAfter, lifecycleAfter, memberAfter] = await Promise.all([
    readAllStockLotDownsideRules(conn, 37), readAllOrdinaryTagDownsideRules(conn, 37), readLifecycle(conn),
    rows(conn, `SELECT ${MEMBER_COLUMNS},m.initial_balances AS initialBalances FROM ledger_members m INNER JOIN users u ON u.id=m.userId
      WHERE m.ledgerId=? AND m.userId=? AND m.member_type='real' LIMIT 2`, [37, input.targetUserId]),
  ]);
  if (JSON.stringify(stockAfter) !== JSON.stringify(stockRules) || JSON.stringify(Array.from(ordinaryAfter.entries())) !== JSON.stringify(Array.from(ordinaryRules.entries()))
    || JSON.stringify(lifecycleAfter) !== JSON.stringify(lifecycleRows) || JSON.stringify(memberAfter) !== JSON.stringify(members)) {
    throw new TRPCError({ code: 'CONFLICT', message: '标签规则、全局状态或本人参与配置在统计期间变化，请刷新重算' });
  }
  const totalImpactCny = sumUserImpactCny(results), pendingCount = results.filter(r => r.status !== 'ready').length;
  const profits = verifiedUserProfitsCny(results, totalImpactCny);
  return { ledgerId: 37, targetUserId: input.targetUserId, displayName: target.displayName, canEdit: true, basis: 'member_raw_minus_counted',
    asOf: new Date(now).toISOString(), categories: results, totalImpactCny, ...profits, status: totalImpactCny === null ? 'pending' : 'ready', pendingCount,
    notice: '本人原始累计收益 − 强平计入累计收益：正数为少计、负数为多计；只按真实参与和退出记录，未支付与钱包金额不在此统计内。用户级不受影响优先于标签规则并覆盖全部历史。'
      + (results.some(category => category.lines.some(line => line.profitBasis === 'no_data_zero' && line.rawPnlCny === 0 && line.countedPnlCny === 0)) ? '普通标签在本人有效参与区间内没有金额记录时，按约定计0；缺少行情、日期或金额异常仍待核验。' : '')
      + (profits.profitScope === 'verified_only' ? '获利仅汇总已核验标签，未包含标签已列明；影响总计仍保留全部标签口径，不将未核验影响当成0。' : '')
      + (profits.totalRawPnlCny === null || profits.totalCountedPnlCny === null ? '尚无可完整核验的本人标签获利，两个获利仍待核验。' : '') };
}
