/** 37号日结专属：只读取指定会话日的常规未复权收盘，不把实时行情倒填到过去。 */
import { getOvernightUsSessionDate, isStockMarketSession } from '../shared/stock-market-session';

export type UnifiedCloseQuote = {
  price: number;
  currency: 'USD' | 'CNY';
  source: string;
  updatedAt: string;
  priceDate: string;
};

function normalizeSymbol(raw: string): string | null {
  const value = String(raw || '').trim().toUpperCase();
  return /^(?:[A-Z][A-Z0-9.\-]{0,14}|\d{6}\.(?:SH|SZ|BJ))$/.test(value) ? value : null;
}

export function isValidCloseSessionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function marketDateFromTimestamp(seconds: number, market: 'A' | 'US'): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: market === 'US' ? 'America/New_York' : 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** MySQL DATETIME is a Beijing wall clock. Date-only/missing evidence cannot infer a NY session. */
export function marketSessionDateFromBeijingTradeTimestamp(value: unknown, market: 'A' | 'US'): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const [date, time] = value.split(/[ T]/);
  if (!isValidCloseSessionDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) return null;
  const instant = Date.parse(`${date}T${time}+08:00`);
  return Number.isFinite(instant) ? marketDateFromTimestamp(instant / 1000, market) : null;
}

/** Yahoo 的 close 而不是 adjclose；只接受目标市场交易日的真实日线。 */
export function parseYahooSessionClose(payload: any, market: 'A' | 'US', sessionDate: string): UnifiedCloseQuote | null {
  if (!isStockMarketSession(sessionDate, market)) return null;
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  const expectedCurrency = market === 'US' ? 'USD' : 'CNY';
  if (!Array.isArray(timestamps) || !Array.isArray(closes) || String(result?.meta?.currency || '').toUpperCase() !== expectedCurrency) return null;
  for (let index = timestamps.length - 1; index >= 0; index -= 1) {
    const price = Number(closes[index]);
    if (closes[index] === null || closes[index] === undefined || !Number.isFinite(price) || price <= 0) continue;
    if (marketDateFromTimestamp(Number(timestamps[index]), market) !== sessionDate) continue;
    return { price, currency: expectedCurrency, source: 'unified_close_yahoo', updatedAt: new Date().toISOString(), priceDate: sessionDate };
  }
  return null;
}

async function fetchTushareSessionClose(symbol: string, sessionDate: string): Promise<UnifiedCloseQuote | null> {
  const token = String(process.env.TUSHARE_TOKEN || process.env.TS_TOKEN || '').trim();
  if (!token) return null;
  const market = /^\d{6}\.(?:SH|SZ|BJ)$/.test(symbol) ? 'A' : 'US';
  const compactDate = sessionDate.replace(/-/g, '');
  try {
    const response = await fetch('https://api.tushare.pro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_name: market === 'A' ? 'daily' : 'us_daily', token,
        params: { ts_code: symbol, start_date: compactDate, end_date: compactDate }, fields: 'ts_code,trade_date,close' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as any;
    if (Number(payload?.code) !== 0) return null;
    const fields = payload?.data?.fields;
    const rows = payload?.data?.items;
    if (!Array.isArray(fields) || !Array.isArray(rows)) return null;
    const dateIndex = fields.indexOf('trade_date');
    const closeIndex = fields.indexOf('close');
    const symbolIndex = fields.indexOf('ts_code');
    if (dateIndex < 0 || closeIndex < 0 || symbolIndex < 0) return null;
    for (const row of rows) {
      if (!Array.isArray(row) || String(row[dateIndex]) !== compactDate || String(row[symbolIndex]).toUpperCase() !== symbol) continue;
      const price = Number(row[closeIndex]);
      if (!Number.isFinite(price) || price <= 0) continue;
      return { price, currency: market === 'A' ? 'CNY' : 'USD', source: 'unified_close_tushare', updatedAt: new Date().toISOString(), priceDate: sessionDate };
    }
    return null;
  } catch { return null; }
}

async function fetchYahooSessionClose(symbol: string, sessionDate: string): Promise<UnifiedCloseQuote | null> {
  const market = /^\d{6}\.(?:SH|SZ|BJ)$/.test(symbol) ? 'A' : 'US';
  const yahooSymbol = symbol.replace(/\.SH$/, '.SS');
  const target = new Date(sessionDate + 'T00:00:00Z').getTime();
  // 周边三天窗口只为时区覆盖；解析时绝不会借用前日/后日价格。
  const period1 = Math.floor((target - 86_400_000) / 1000);
  const period2 = Math.floor((target + 2 * 86_400_000) / 1000);
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const response = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=false`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) continue;
      const quote = parseYahooSessionClose(await response.json(), market, sessionDate);
      if (quote) return quote;
    } catch { /* 真实历史源失败不回退到今日价。 */ }
  }
  return null;
}

/** Raw close completion is market-specific, independent of the A-day publication policy. */
export function isUnifiedMarketCloseCompleted(sessionDate: string, market: 'A' | 'US', now = new Date()): boolean {
  if (!isStockMarketSession(sessionDate, market) || !Number.isFinite(now.getTime())) return false;
  if (market === 'A') return now.getTime() >= Date.parse(`${sessionDate}T15:00:00+08:00`);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}` >= `${sessionDate}T16:00`;
}

/** No SQL. Each returned priceDate remains the real exchange date, never the publication label. */
export async function fetchUnifiedCloseQuotes(rawSymbols: string[], target: string | { A: string; US: string }): Promise<Record<string, UnifiedCloseQuote>> {
  const dates = typeof target === 'string' ? { A: target, US: target } : target;
  if (!isValidCloseSessionDate(dates.A) || !isValidCloseSessionDate(dates.US)) throw new Error('日结会话日期无效');
  const symbols = Array.from(new Set(rawSymbols.map(normalizeSymbol).filter((value): value is string => value !== null)));
  if (symbols.length > 200) throw new Error('单次日结最多读取200只已登记股票');
  for (const symbol of symbols) {
    const market = /^\d{6}\.(?:SH|SZ|BJ)$/.test(symbol) ? 'A' : 'US';
    if (!isUnifiedMarketCloseCompleted(dates[market], market)) throw new Error('目标市场真实交易日尚未收盘或不是交易日');
  }
  const result: Record<string, UnifiedCloseQuote> = {};
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, symbols.length) }, async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++];
      const market = /^\d{6}\.(?:SH|SZ|BJ)$/.test(symbol) ? 'A' : 'US';
      const sessionDate = dates[market];
      const quote = await fetchTushareSessionClose(symbol, sessionDate) || await fetchYahooSessionClose(symbol, sessionDate);
      if (quote) result[symbol] = quote;
    }
  }));
  return result;
}

/** A_D + latest already-closed NY session strictly before D; no D-night quote can enter A_D. */
export async function fetchOvernightUnifiedCloseQuotes(rawSymbols: string[], aDay: string): Promise<Record<string, UnifiedCloseQuote>> {
  const usDay = getOvernightUsSessionDate(aDay);
  if (!usDay) throw new Error('日结归属日必须是已知A股交易日');
  return fetchUnifiedCloseQuotes(rawSymbols, { A: aDay, US: usDay });
}
