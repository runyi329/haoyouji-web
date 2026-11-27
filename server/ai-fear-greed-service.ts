import type { AiFearGreedResult } from '../shared/ai-fear-greed';
import { getAShareCompletedCutoff, isValidAShareTradeDate } from '../shared/a-share-completed-days';
import { buildAiFearGreedIndex, AI_FEAR_GREED_METHOD_VERSION, AI_FEAR_GREED_SOURCE, type AiFearGreedDailyRow } from './ai-fear-greed-engine';
const CACHE_MS = 5 * 60 * 1000, FAILURE_CACHE_MS = 60 * 1000;
let cached: { at: number; cutoff: string; value: AiFearGreedResult } | null = null;
let inflight: Promise<AiFearGreedResult> | null = null;
const unavailable = (): AiFearGreedResult => ({
  status: 'unavailable', methodVersion: AI_FEAR_GREED_METHOD_VERSION, latestDate: null, score: null, band: null, previousScore: null,
  history: [], factors: [
    { key: 'breadth', label: '市场广度', weight: 25 / 80, score: null }, { key: 'momentum', label: '动量', weight: 25 / 80, score: null },
    { key: 'volume', label: '量价', weight: 15 / 80, score: null }, { key: 'downside', label: '下行波动', weight: 15 / 80, score: null },
  ], source: AI_FEAR_GREED_SOURCE, notes: ['行情只读查询暂不可用或超时，未用示例分数替代。请稍后重试。'], lookback: 504, sampleDays: 0,
});
export type AiFearGreedReadExecutor = { execute(sql: string, params?: any[]): Promise<any> };
const scope = "(ts_code LIKE '6%.SH' OR ts_code LIKE '0%.SZ' OR ts_code LIKE '3%.SZ')";
const valid = 'pre_close > 0 AND close > 0 AND pct_chg IS NOT NULL AND amount > 0 AND vol > 0';
const numeric = (value: unknown): number => value === null || value === undefined || value === '' ? NaN : Number(value);
function normalize(row: any): AiFearGreedDailyRow {
  return {
    canonicaldate: String(row.canonicaldate).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
    rawCount: numeric(row.rawCount), validCount: numeric(row.validCount), upCount: numeric(row.upCount), downCount: numeric(row.downCount),
    upAmount: numeric(row.upAmount), downAmount: numeric(row.downAmount), totalAmount: numeric(row.totalAmount), meanReturn: row.meanReturn === null ? null : numeric(row.meanReturn),
  };
}
async function rawRange(connection: AiFearGreedReadExecutor, from: string, through: string): Promise<AiFearGreedDailyRow[]> {
  const aggregated: AiFearGreedDailyRow[] = [];
  let cursor = from;
  while (cursor <= through) {
    const nextDate = new Date(Date.UTC(Number(cursor.slice(0, 4)) + 1, Number(cursor.slice(4, 6)) - 1, Number(cursor.slice(6, 8))));
    const next = nextDate.toISOString().slice(0, 10).replace(/-/g, '');
    const previousDay = new Date(nextDate.getTime() - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    const end = previousDay < through ? previousDay : through;
    const [rows] = await connection.execute(
      `SELECT /*+ MAX_EXECUTION_TIME(20000) */ trade_date AS canonicaldate, COUNT(*) AS rawCount,
       SUM(CASE WHEN ${valid} THEN 1 ELSE 0 END) AS validCount,
       SUM(CASE WHEN ${valid} AND pct_chg > 0 THEN 1 ELSE 0 END) AS upCount,
       SUM(CASE WHEN ${valid} AND pct_chg < 0 THEN 1 ELSE 0 END) AS downCount,
       SUM(CASE WHEN ${valid} AND pct_chg > 0 THEN amount ELSE 0 END) AS upAmount,
       SUM(CASE WHEN ${valid} AND pct_chg < 0 THEN amount ELSE 0 END) AS downAmount,
       SUM(CASE WHEN ${valid} THEN amount ELSE 0 END) AS totalAmount,
       AVG(CASE WHEN ${valid} THEN pct_chg / 100 ELSE NULL END) AS meanReturn
       FROM ts_daily FORCE INDEX (idx_trade_date) WHERE trade_date >= ? AND trade_date <= ? AND ${scope}
       GROUP BY trade_date ORDER BY trade_date`, [cursor, end]);
    if (!Array.isArray(rows)) throw new Error('Invalid market rows');
    aggregated.push(...rows.map(normalize)); cursor = next;
  }
  return aggregated;
}
/** Read verified daily aggregates first; never run any historical job from a public request. */
export async function readAiFearGreedRows(connection: AiFearGreedReadExecutor, cutoff = getAShareCompletedCutoff()): Promise<AiFearGreedDailyRow[]> {
  if (!isValidAShareTradeDate(cutoff)) throw new Error('Invalid completed date');
  const [maxRows] = await connection.execute(`SELECT /*+ MAX_EXECUTION_TIME(20000) */ trade_date AS latestDate FROM ts_daily WHERE trade_date <= ? AND ${scope} ORDER BY trade_date DESC LIMIT 1`, [cutoff]);
  const latestText = (maxRows as any[])?.[0]?.latestDate;
  if (latestText === undefined || latestText === null) return [];
  if (!isValidAShareTradeDate(latestText) || latestText > cutoff) throw new Error('Invalid source date');
  let verifiedRows: any[] = [];
  try {
    const [rows] = await connection.execute(`SELECT /*+ MAX_EXECUTION_TIME(20000) */ trade_date AS canonicaldate,
      raw_count AS rawCount,valid_count AS validCount,up_count AS upCount,down_count AS downCount,
      up_amount AS upAmount,down_amount AS downAmount,total_amount AS totalAmount,mean_return AS meanReturn,
      source,source_hash,source_rows,verified_at
      FROM ai_fear_greed_market_daily WHERE trade_date <= ? AND universe='shu-sz-a-share-v1'
      ORDER BY trade_date DESC LIMIT 1000`, [latestText]);
    if (!Array.isArray(rows)) throw new Error('Invalid verified market rows');
    verifiedRows = rows;
  } catch (error: any) {
    if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_TABLE_ERROR') throw error;
  }
  if (verifiedRows.length) {
    const result = verifiedRows.map(row => {
      const date = row.canonicaldate;
      if (!isValidAShareTradeDate(date) || date > latestText) throw new Error('Invalid verified market date');
      const verified = row.source === 'tushare_daily' && /^[a-f0-9]{64}$/.test(row.source_hash || '') && row.verified_at != null && numeric(row.rawCount) >= 3000 && numeric(row.source_rows) >= numeric(row.rawCount);
      // Keep official-calendar placeholders as explicit null days, rather than collapsing the historical time axis.
      return verified ? normalize(row) : { canonicaldate: date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), rawCount: 0, validCount: 0, upCount: 0, downCount: 0, upAmount: 0, downAmount: 0, totalAmount: 0, meanReturn: null };
    }).sort((a, b) => a.canonicaldate.localeCompare(b.canonicaldate));
    const last = result.at(-1)!.canonicaldate.replace(/-/g, '');
    if (last < latestText) {
      const date = new Date(`${result.at(-1)!.canonicaldate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1);
      const subsequent = await rawRange(connection, date.toISOString().slice(0, 10).replace(/-/g, ''), latestText);
      result.push(...subsequent.map(row => row.rawCount >= 3000 ? row : { ...row, meanReturn: null }));
    }
    return result;
  }
  const fromDate = new Date(Date.UTC(Number(latestText.slice(0, 4)) - 4, Number(latestText.slice(4, 6)) - 1, Number(latestText.slice(6, 8))));
  return rawRange(connection, fromDate.toISOString().slice(0, 10).replace(/-/g, ''), latestText);
}
async function compute(cutoff: string): Promise<AiFearGreedResult> {
  try {
    const { getDbConnection } = await import('./db');
    const connection = await getDbConnection();
    if (!connection) return unavailable();
    return buildAiFearGreedIndex(await readAiFearGreedRows(connection, cutoff));
  } catch { return unavailable(); }
}
export function getAiFearGreedIndex(): Promise<AiFearGreedResult> {
  const cutoff = getAShareCompletedCutoff();
  const ttl = cached?.value.status === 'unavailable' ? FAILURE_CACHE_MS : CACHE_MS;
  if (cached && cached.cutoff === cutoff && Date.now() - cached.at < ttl) return Promise.resolve(cached.value);
  if (!inflight) inflight = compute(cutoff).then(value => { cached = { at: Date.now(), cutoff, value }; return value; }).finally(() => { inflight = null; });
  return inflight;
}
export function clearAiFearGreedCacheForTests() { cached = null; inflight = null; }
