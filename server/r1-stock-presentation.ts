import { getDbConnection } from './db';
import { readTagVisible } from '../shared/tag-visibility';
import {
  R1_STOCK_LEDGER_ID,
  type R1StockPresentationContext, type R1AiParticipationPortfolio,
  type R1AiParticipationRow, type R1AiParticipationSummary, type R1RecordedMargin,
} from '../shared/r1-stock-presentation';
import { portfolioCashMultiplier } from '../shared/portfolio-instruments';
import { readLedger37Balances, readLedger37AiEnabled, isLedger37AiSystemAdmin } from './ledger37-ai-presentation';

export type R1StockPresentationInput = {
  ledgerId: 37; categoryId: number; userId: number; systemRole?: string; isViewingAs?: boolean;
};
export function readR1Balances(raw: unknown): Record<string, unknown> { return readLedger37Balances(raw); }
export function readR1AiEnabled(balances: Record<string, unknown>): boolean { return readLedger37AiEnabled(balances); }
function validateScope(input: R1StockPresentationInput) {
  if (input.ledgerId !== 37 || !Number.isSafeInteger(input.categoryId) || input.categoryId <= 0) throw new Error('AI展示仅适用于37号账本顶层股票标签');
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) throw new Error('成员ID无效');
}
function systemAdmin(input: R1StockPresentationInput) {
  // 代看不继承真实操作者的系统角色，也不是实际管理上下文。
  return isLedger37AiSystemAdmin(input);
}
export async function readR1StockPresentationState(input: R1StockPresentationInput, connection?: any) {
  validateScope(input);
  const conn = connection ?? await getDbConnection();
  if (!conn) throw new Error('数据库连接不可用');
  const [rows] = await conn.execute(
    `SELECT c.id, c.ledgerId, c.name, c.parentId, c.accounting_mode,
            m.userId AS member_user_id, m.role AS member_role, m.initial_balances AS initialBalances
     FROM ledger_categories c
     LEFT JOIN ledger_members m ON m.ledgerId=c.ledgerId AND m.userId=?
     WHERE c.id = ? AND c.ledgerId = ? LIMIT 1`, [input.userId, input.categoryId, input.ledgerId]);
  const row = rows[0];
  if (!row || Number(row.id) !== input.categoryId || Number(row.ledgerId) !== R1_STOCK_LEDGER_ID
    || row.parentId !== null || row.accounting_mode !== 'stock_portfolio') throw new Error('该标签不是股票持仓模式');
  const isMember = row.member_user_id != null;
  if (!isMember && !systemAdmin(input)) throw new Error('您不是此账本的成员');
  const balances = isMember ? readR1Balances(row.initialBalances) : {};
  if (isMember && row.member_role !== 'owner' && !readTagVisible(balances, String(row.name))) throw new Error('您无权查看此标签');
  const canManage = !input.isViewingAs && (systemAdmin(input) || row.member_role === 'owner' || row.member_role === 'admin');
  const context: R1StockPresentationContext = {
    ledgerId: 37, categoryId: input.categoryId, viewerUserId: input.userId,
    canManage, aiEnabled: readR1AiEnabled(balances),
  };
  return { context, categoryName: String(row.name), balances, isMember };
}
export async function getR1StockPresentationContext(input: R1StockPresentationInput): Promise<R1StockPresentationContext> {
  return (await readR1StockPresentationState(input)).context;
}
export async function setR1StockAiDisplay(_input: R1StockPresentationInput & { targetUserId: number; enabled: boolean }): Promise<{ success: true; aiEnabled: boolean }> {
  throw new Error('使用账本全局AI设置');
}
export function assertR1RawReadAllowed(context: R1StockPresentationContext) {
  if (context.aiEnabled && !context.canManage) throw new Error('R1 AI展示已开启，请使用安全参与收益接口');
}
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function r1PnlSummary(floating: unknown, realized: unknown): R1AiParticipationSummary {
  const floatingPnl = finite(floating), realizedPnl = finite(realized);
  return { floatingPnl, realizedPnl, totalPnl: floatingPnl === null || realizedPnl === null ? null : finite(floatingPnl + realizedPnl) };
}
export function projectR1Participation(row: R1AiParticipationRow): R1AiParticipationRow {
  // 显式字段白名单，不spread已算组合、价格、批次备注、其他成员或审计对象。
  return { id: row.id, symbol: row.symbol, stockName: row.stockName, currency: row.currency,
    quantity: row.quantity, allocatedQuantity: row.allocatedQuantity, allocationRatio: row.allocationRatio,
    startDate: row.startDate, status: row.status, ...r1PnlSummary(row.floatingPnl, row.realizedPnl) };
}
export function projectR1AiPortfolio(input: {
  context: R1StockPresentationContext; portfolio: any; participations: R1AiParticipationRow[];
  observation: { summary: any; participations: R1AiParticipationRow[] } | null; recordedMargins: R1RecordedMargin[] | null;
}): R1AiParticipationPortfolio {
  const times = (input.portfolio.positions ?? []).map((row: any) => row.quoteUpdatedAt)
    .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0).sort();
  const observationSummary = input.observation ? (() => {
    const usdRate = finite(input.portfolio.summary.usdCnyRate), usdtRate = finite(input.portfolio.summary.usdtCnyRate);
    const converted = input.observation.participations.reduce((acc, row) => {
      const multiplier = portfolioCashMultiplier(row.currency, usdRate, usdtRate);
      if (multiplier === null || row.floatingPnl === null || row.realizedPnl === null) return null;
      return acc === null ? null : { floating: acc.floating + row.floatingPnl * multiplier, realized: acc.realized + row.realizedPnl * multiplier };
    }, { floating: 0, realized: 0 } as { floating: number; realized: number } | null);
    return converted === null ? { floatingPnl: null, realizedPnl: null, totalPnl: null } : r1PnlSummary(converted.floating, converted.realized);
  })() : null;
  return { viewerUserId: input.context.viewerUserId, aiEnabled: input.context.aiEnabled,
    usdCnyRate: finite(input.portfolio.summary.usdCnyRate), usdtCnyRate: finite(input.portfolio.summary.usdtCnyRate),
    updatedAt: times.at(-1) ?? null,
    summary: r1PnlSummary(input.portfolio.summary.floatingPnl, input.portfolio.summary.realizedPnl),
    participations: input.participations.map(projectR1Participation),
    recordedMargins: input.recordedMargins?.map(row => ({ assetCode: row.assetCode, amount: row.amount })) ?? null,
    observation: input.observation ? { summary: observationSummary!,
      participations: input.observation.participations.map(projectR1Participation) } : null,
  };
}

// 现金保证金独立原币精度：不使用20%需求、股票costValue、行情或钱包总余额。
const SCALE = BigInt('1000000000000000000');
const ZERO = BigInt(0);
function decimalUnits(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return null;
  const text = String(value).trim();
  if (!/^-?\d{1,18}(?:\.\d{1,18})?$/.test(text)) return null;
  const negative = text.startsWith('-'), [integer, fraction = ''] = text.replace(/^-/, '').split('.');
  const units = BigInt(integer) * SCALE + BigInt(fraction.padEnd(18, '0'));
  return negative ? -units : units;
}
function decimalString(units: bigint): string {
  const sign = units < ZERO ? '-' : '', abs = units < ZERO ? -units : units;
  const fraction = (abs % SCALE).toString().padStart(18, '0').replace(/0+$/, '');
  return `${sign}${abs / SCALE}${fraction ? `.${fraction}` : ''}`;
}
function coinOf(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z][A-Z0-9]{0,15}$/.test(value) ? value : null;
}
export async function readR1RecordedMargins(connection: any, balances: Record<string, unknown>, tagName: string, userId: number): Promise<R1RecordedMargin[] | null> {
  const raw = balances[`${tagName}__margins`];
  let entries: any[];
  if (raw === undefined || raw === null || raw === '') {
    const legacy = balances[`${tagName}__margin`];
    if (legacy === undefined || legacy === null || legacy === '') return [];
    entries = [{ coin: balances[`${tagName}__marginCoin`], amount: legacy }];
  } else {
    try { entries = typeof raw === 'string' ? JSON.parse(raw) : raw as any[]; } catch { return null; }
    if (!Array.isArray(entries)) return null;
  }
  const totals = new Map<string, bigint>(), holdIds = new Set<number>(), entryIds = new Set<string>();
  const add = (coin: string, amount: bigint) => totals.set(coin, (totals.get(coin) ?? ZERO) + amount);
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const coin = coinOf(entry.coin), amount = decimalUnits(entry.amount);
    if (!coin || amount === null) return null;
    if (entry.id != null) { const id = String(entry.id); if (entryIds.has(id)) return null; entryIds.add(id); }
    if (entry.source === 'wallet_hold') {
      if (!Number.isSafeInteger(Number(entry.holdId)) || Number(entry.holdId) <= 0) return null;
      holdIds.add(Number(entry.holdId)); // 负解冻/正冲正不重复叠加，查询该冻结单当前剩余一次。
    } else {
      if (entry.source != null && entry.source !== '' && entry.source !== 'manual') return null;
      // 手工负转出和冲正均是已登记的带符号流水；不跳过原负行后又叠加正冲正。
      if (entry.entryKind != null && !['freeze', 'release', 'reversal'].includes(entry.entryKind)) return null;
      add(coin, amount);
    }
  }
  if (holdIds.size) {
    const ids = Array.from(holdIds);
    const [rows] = await connection.execute(
      `SELECT id, ledger_id, user_id, tag_name, asset_code, amount, released_amount, status
       FROM ai_wallet_project_holds WHERE ledger_id = ? AND user_id = ? AND tag_name = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [37, userId, tagName, ...ids]);
    if (rows.length !== ids.length) return null;
    const seen = new Set<number>();
    for (const row of rows) {
      const id = Number(row.id), coin = coinOf(row.asset_code), amount = decimalUnits(row.amount), released = decimalUnits(row.released_amount);
      if (!holdIds.has(id) || seen.has(id) || Number(row.ledger_id) !== 37 || Number(row.user_id) !== userId || row.tag_name !== tagName
        || !coin || amount === null || released === null || amount < ZERO || released < ZERO || released > amount
        || !['active', 'released'].includes(row.status) || (row.status === 'released' && released !== amount)) return null;
      if (entries.some(entry => entry.source === 'wallet_hold' && Number(entry.holdId) === id && entry.coin !== coin)) return null;
      seen.add(id); add(coin, row.status === 'active' ? amount - released : ZERO);
    }
  }
  if (Array.from(totals.values()).some(amount => amount < ZERO)) return null;
  return Array.from(totals).sort(([a], [b]) => a.localeCompare(b)).map(([assetCode, amount]) => ({ assetCode, amount: decimalString(amount) }));
}
