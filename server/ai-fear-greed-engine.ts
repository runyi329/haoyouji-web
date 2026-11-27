import { aiFearGreedBand, type AiFearGreedFactor, type AiFearGreedPoint, type AiFearGreedResult } from '../shared/ai-fear-greed';

export const AI_FEAR_GREED_METHOD_VERSION = 'pulse-a-share-fg-preview-v1' as const;
export const AI_FEAR_GREED_SOURCE = '沪深A股已入库交易样本 · 等权日收益合成';
export const LOOKBACK_DAYS = 504;

/** Engine input contract: meanReturn is a decimal (0.01 = +1%) or null for an unusable day. */
export type AiFearGreedDailyRow = {
  canonicaldate: string;
  rawCount: number;
  validCount: number;
  upCount: number;
  downCount: number;
  upAmount: number;
  downAmount: number;
  totalAmount: number;
  meanReturn: number | null;
};

type Computed = { breadth: number; momentum: number; volume: number; downside: number };
const labels: Record<keyof Computed, string> = { breadth: '市场广度', momentum: '动量', volume: '量价', downside: '下行波动' };
const weights: Record<keyof Computed, number> = { breadth: 25, momentum: 25, volume: 15, downside: 15 };
const keys = ['breadth', 'momentum', 'volume', 'downside'] as const;
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const validDate = (s: unknown) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const fractionWeight = (key: keyof Computed) => weights[key] / 80;
const empty = (status: AiFearGreedResult['status'], latestDate: string | null, notes: string[]): AiFearGreedResult => ({
  status, methodVersion: AI_FEAR_GREED_METHOD_VERSION, latestDate, score: null, band: null, previousScore: null,
  history: [], factors: keys.map(key => ({ key, label: labels[key], weight: fractionWeight(key), score: null })),
  source: AI_FEAR_GREED_SOURCE, notes, lookback: LOOKBACK_DAYS, sampleDays: 0,
});

function rollingMean(values: Array<number | null>, end: number, length: number): number | null {
  if (end < length - 1) return null;
  const part = values.slice(end - length + 1, end + 1);
  return part.length === length && part.every(finite) ? part.reduce((a, b) => a + b, 0) / length : null;
}
function percentile(value: number, prior: number[]): number | null {
  if (!finite(value) || prior.length !== LOOKBACK_DAYS || !prior.every(finite)) return null;
  const less = prior.filter(x => x < value).length;
  const equal = prior.filter(x => x === value).length;
  return ((less + equal / 2) / prior.length) * 100;
}
function scoreAt(index: number, computed: Array<Computed | null>): { score: number; factors: Record<keyof Computed, number> } | null {
  if (index < LOOKBACK_DAYS) return null;
  const current = computed[index];
  if (!current || !keys.every(key => finite(current[key]))) return null;
  const priorRows = computed.slice(index - LOOKBACK_DAYS, index);
  if (priorRows.length !== LOOKBACK_DAYS || !priorRows.every(x => x && keys.every(key => finite(x[key])))) return null;
  const factors = {} as Record<keyof Computed, number>;
  for (const key of keys) {
    const p = percentile(current[key], priorRows.map(x => (x as Computed)[key]));
    if (p === null) return null;
    factors[key] = key === 'downside' ? 100 - p : p;
  }
  return { score: keys.reduce((sum, key) => sum + factors[key] * fractionWeight(key), 0), factors };
}

export function buildAiFearGreedIndex(input: AiFearGreedDailyRow[]): AiFearGreedResult {
  if (!Array.isArray(input)) return empty('unavailable', null, ['行情日聚合输入不是数组，已 fail closed。']);
  if (input.length === 0) return empty('insufficient', null, ['无行情日聚合数据，无法计算。']);
  const rows = [...input].sort((a, b) => String(a?.canonicaldate).localeCompare(String(b?.canonicaldate)));
  const latestDate = rows.at(-1)?.canonicaldate ?? null;
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || !validDate(r.canonicaldate) || seen.has(r.canonicaldate) ||
      ![r.rawCount, r.validCount, r.upCount, r.downCount].every(x => finite(x) && Number.isSafeInteger(x) && x >= 0) ||
      ![r.upAmount, r.downAmount, r.totalAmount].every(x => finite(x) && x >= 0) ||
      (r.validCount > r.rawCount) || r.upCount + r.downCount > r.validCount ||
      r.upAmount + r.downAmount > r.totalAmount + Math.max(1e-8, r.totalAmount * 1e-12) ||
      !(r.meanReturn === null || finite(r.meanReturn))) {
      return empty('unavailable', latestDate, ['行情日聚合含非法、重复或缺失字段，已 fail closed。']);
    }
    seen.add(r.canonicaldate);
  }
  const sampleDays = rows.length;
  if (rows.length < LOOKBACK_DAYS + 1) return { ...empty('insufficient', latestDate, [`有效同口径交易日不足${LOOKBACK_DAYS + 1}日，未凑数计算。`]), sampleDays };

  const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
  const complete = rows.map(r => r.meanReturn !== null && r.meanReturn > -1 && r.meanReturn < 10 && r.totalAmount > 0 && r.rawCount > 0 && r.validCount >= 1000 && r.validCount / r.rawCount >= 0.95);
  const collapse = rows.map((r, i) => i >= 20 && r.validCount < median(rows.slice(i - 20, i).map(x => x.validCount)) * 0.8);
  const quality = rows.map((_, i) => complete[i] && !collapse[i]);

  const dailyBreadth: Array<number | null> = [];
  const dailyVolume: Array<number | null> = [];
  const dailyRisk: Array<number | null> = [];
  const path: Array<number | null> = [];
  let base = 100;
  let pathRun = 0;
  rows.forEach((r, i) => {
    if (!quality[i] || r.meanReturn === null) {
      dailyBreadth[i] = dailyVolume[i] = dailyRisk[i] = path[i] = null;
      pathRun = 0;
      return;
    }
    base = pathRun === 0 ? 100 : (path[i - 1] as number);
    base *= 1 + r.meanReturn;
    path[i] = base;
    pathRun += 1;
    dailyBreadth[i] = r.validCount > 0 ? (r.upCount - r.downCount) / r.validCount : null;
    const previous20 = rows.slice(Math.max(0, i - 20), i);
    const previousValid = previous20.length === 20 && previous20.every((x, j) => quality[i - 20 + j]);
    const avg20 = previousValid ? previous20.reduce((a, x) => a + x.totalAmount, 0) / 20 : null;
    dailyVolume[i] = avg20 !== null && avg20 > 0 ? (r.upAmount - r.downAmount) / avg20 : null;
    dailyRisk[i] = r.meanReturn < 0 ? r.meanReturn ** 2 : 0;
  });
  const computed: Array<Computed | null> = rows.map((_, i) => {
    const breadth = rollingMean(dailyBreadth, i, 5);
    const volume = rollingMean(dailyVolume, i, 5);
    const risk = rollingMean(dailyRisk, i, 20);
    const segment = i >= 59 && path.slice(i - 59, i + 1).every(finite);
    const ma60 = segment ? (path.slice(i - 59, i + 1) as number[]).reduce((a, b) => a + b, 0) / 60 : null;
    return breadth !== null && volume !== null && risk !== null && ma60 !== null && finite(path[i]) ? {
      breadth, momentum: (path[i] as number) / ma60 - 1, volume, downside: Math.sqrt(risk),
    } : null;
  });
  const scored = rows.map((_, i) => scoreAt(i, computed));
  const start = Math.max(0, rows.length - 252);
  const history: AiFearGreedPoint[] = rows.slice(start).map((r, j) => ({ date: r.canonicaldate, score: scored[start + j]?.score ?? null }));
  const current = scored.at(-1);
  const previousScore = scored.length >= 2 ? scored.at(-2)?.score ?? null : null;
  const factors: AiFearGreedFactor[] = keys.map(key => ({ key, label: labels[key], weight: fractionWeight(key), score: current ? current.factors[key] : null }));
  const notes = ['固定四因子试算：广度25/80、动量25/80、量价15/80、下行波动15/80。', '未纳入涨跌停压力；未验证预测能力；历史由本版本回算，不是过去已发布记录。', 'base100仅用于合成等权市场样本路径，不代表真实指数或价格；不使用旧趋势缓存、初始上市价或个人账本。', '每日有效率需达到95%、样本数至少1000；坏日保留null，后续有效日从100重启，MA60须连续60个有效日。'];
  if (!current) notes.push('最新源日期缺少完整回看期或样本完整性，未用旧日值冒充当前。');
  return { status: current ? 'provisional' : 'insufficient', methodVersion: AI_FEAR_GREED_METHOD_VERSION, latestDate,
    score: current?.score ?? null, band: current ? aiFearGreedBand(current.score) : null, previousScore,
    history, factors, source: AI_FEAR_GREED_SOURCE, notes, lookback: LOOKBACK_DAYS, sampleDays };
}
