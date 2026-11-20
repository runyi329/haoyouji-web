import { getDbConnection } from './db';
import {
  isLedger37AiSystemAdmin, readLedger37PresentationState,
  type Ledger37PresentationInput,
} from './ledger37-ai-presentation';
import { calculateMibanWalletValue, type MibanWalletValueInput } from '../shared/miban-wallet-value';
import { readLedger37AiWalletMarket } from './ledger37-ai-wallet-market';

type ReadConnection = { execute(sql: string, values: unknown[]): Promise<any> };

function rowsOf(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('钱包读取结果无效');
  return value;
}
function amount(value: unknown, field: string): number {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'string' && value.trim() === '')) throw new Error(`钱包${field}数据无效`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`钱包${field}数据无效`);
  return parsed;
}
function assertValidCount(value: unknown, field: string) {
  if (amount(value, field) !== 0) throw new Error(`钱包${field}异常`);
}

/**
 * Mirrors ledger37-wallet.getWalletFundingBalanceSummary without its schema initializer.
 * One non-locking DECIMAL statement reads both GLOBAL funding accounts. All active holds,
 * including 37 projects, 52 orders and manual freezes, live in ai_wallet_project_holds.
 * Never filter them by this presentation's ledger, and never sum balance-history again.
 * Required funding tables fail closed; only the independent market table is optional below.
 */
async function readFunding(conn: ReadConnection, userId: number): Promise<Pick<MibanWalletValueInput, 'usdt' | 'cny'>> {
  const [result] = await conn.execute(`SELECT u.id AS user_id,
      CAST(u.balance + COALESCE(m.usdt_amount, 0) AS CHAR) AS usdt_total,
      CAST(u.cny_balance + COALESCE(m.cny_amount, 0) AS CHAR) AS cny_total,
      CAST(COALESCE(h.usdt_frozen, 0) AS CHAR) AS usdt_frozen,
      CAST(COALESCE(h.cny_frozen, 0) AS CHAR) AS cny_frozen,
      CAST(u.balance + COALESCE(m.usdt_amount, 0) - COALESCE(h.usdt_frozen, 0) AS CHAR) AS usdt_available,
      CAST(u.cny_balance + COALESCE(m.cny_amount, 0) - COALESCE(h.cny_frozen, 0) AS CHAR) AS cny_available,
      COALESCE(m.invalid_manual, 0) AS invalid_manual,
      COALESCE(h.invalid_holds, 0) AS invalid_holds
    FROM users u
    LEFT JOIN (
      SELECT user_id,
        SUM(CASE WHEN COALESCE(note, '') LIKE '[CNY]%' THEN amount ELSE 0 END) AS cny_amount,
        SUM(CASE WHEN COALESCE(note, '') NOT LIKE '[CNY]%' AND COALESCE(note, '') NOT LIKE '[BALANCE_BASE]%' THEN amount ELSE 0 END) AS usdt_amount,
        SUM(CASE WHEN amount IS NULL THEN 1 ELSE 0 END) AS invalid_manual
      FROM af_manual_balances WHERE user_id = ? GROUP BY user_id
    ) m ON m.user_id = u.id
    LEFT JOIN (
      SELECT user_id,
        SUM(CASE WHEN asset_code = 'USDT' THEN amount - COALESCE(released_amount, 0) ELSE 0 END) AS usdt_frozen,
        SUM(CASE WHEN asset_code = 'CNY' THEN amount - COALESCE(released_amount, 0) ELSE 0 END) AS cny_frozen,
        SUM(CASE WHEN amount IS NULL OR amount < 0 OR COALESCE(released_amount, 0) < 0
          OR COALESCE(released_amount, 0) > amount THEN 1 ELSE 0 END) AS invalid_holds
      FROM ai_wallet_project_holds WHERE user_id = ? AND asset_code IN ('CNY', 'USDT')
        AND status = 'active' GROUP BY user_id
    ) h ON h.user_id = u.id
    WHERE u.id = ? LIMIT 1`, [userId, userId, userId]);
  const rows = rowsOf(result);
  if (rows.length !== 1 || rows[0].user_id !== userId) throw new Error('钱包用户不存在或身份不匹配');
  const row = rows[0];
  assertValidCount(row.invalid_manual, '手工流水');
  assertValidCount(row.invalid_holds, '冻结台账');
  const summary = (code: 'usdt' | 'cny') => {
    const total = amount(row[`${code}_total`], `${code}总额`);
    const frozen = amount(row[`${code}_frozen`], `${code}冻结`);
    const available = amount(row[`${code}_available`], `${code}可用`);
    if (frozen < 0) throw new Error('钱包冻结台账异常');
    return { total, frozen, available };
  };
  return { usdt: summary('usdt'), cny: summary('cny') };
}

/** Same balance columns as getUserMultiAssetBalances; available already excludes freezes. */
async function readMarketAssets(conn: ReadConnection, userId: number): Promise<MibanWalletValueInput['assets']> {
  let result: unknown;
  try {
    [result] = await conn.execute(`SELECT asset_code,
        CAST(available_balance AS CHAR) AS available_balance,
        CAST(frozen_balance AS CHAR) AS frozen_balance,
        CAST(available_balance + frozen_balance AS CHAR) AS total_balance
      FROM ai_wallet_asset_balances WHERE user_id = ?
      ORDER BY asset_code ASC`, [userId]);
  } catch (error: any) {
    // This SELECT references only this optional table. No permission/column/network fallback.
    if ((error?.code ?? error?.cause?.code) === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
  return rowsOf(result).map(row => {
    if (typeof row.asset_code !== 'string' || !row.asset_code.trim()) throw new Error('钱包资产代码无效');
    // Validate before price availability is considered. Do not hide unknown nonzero assets.
    const available = amount(row.available_balance, '资产可用');
    const frozen = amount(row.frozen_balance, '资产冻结');
    amount(row.total_balance, '资产总额');
    if (available < 0 || frozen < 0) throw new Error('钱包市场资产余额异常');
    return { assetCode: row.asset_code, availableBalance: row.available_balance as string | number,
      frozenBalance: row.frozen_balance as string | number, totalBalance: row.total_balance as string | number };
  });
}

/**
 * No router import, balance initializer, transaction, scanner startup or provider request.
 * The market adapter supplies exactly getCryptoPrices' display snapshot, not settlement FX;
 * null FX is distinct from a legitimate cached rate whose numeric value happens to be 6.7.
 */
export async function getMyLedger37AiWalletValue(input: Ledger37PresentationInput): Promise<{ viewerUserId: number; availableCny: number | null }> {
  const state = await readLedger37PresentationState(input);
  if (state.context.ledgerId !== 37 || state.context.viewerUserId !== input.userId) throw new Error('钱包展示身份不匹配');
  const adminSelf = isLedger37AiSystemAdmin(input);
  if (!state.isMember) throw new Error('您不是此账本的成员');
  if (!state.context.aiEnabled && !adminSelf) throw new Error('账本AI展示尚未开启');
  // Authorization is complete before acquiring a wallet connection or reading market cache.
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接不可用');
  const funding = await readFunding(conn as ReadConnection, state.context.viewerUserId);
  const assets = await readMarketAssets(conn as ReadConnection, state.context.viewerUserId);
  const market = await readLedger37AiWalletMarket();
  const prices: Record<string, number> = {};
  for (const [code, price] of Object.entries(market.prices)) prices[code] = amount(price, `行情${code}`);
  const rate = market.usdtCnyRate;
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) throw new Error('钱包汇率数据无效');
  // The shared pure engine requires a finite positive rate. Never fabricate one even for
  // a CNY-only wallet; upstream null means the same unknown display state as Miban.
  if (rate === null) return { viewerUserId: state.context.viewerUserId, availableCny: null };
  const value = calculateMibanWalletValue({ ...funding, assets, prices, usdtCnyRate: rate });
  return { viewerUserId: state.context.viewerUserId, availableCny: value.availableCny };
}
