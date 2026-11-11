/** 37号日结专属：只读取指定会话日的常规未复权收盘，不把实时行情倒填到过去。 */
import { getOvernightUsSessionDate, isStockMarketSession, previousStockMarketSession } from '../shared/stock-market-session';

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

function sinaSymbolForClose(symbol: string): string | null {
  const aShare = /^(\d{6})\.(SH|SZ|BJ)$/.exec(symbol);
  if (aShare) return `${aShare[2].toLowerCase()}${aShare[1]}`;
  // Do not guess Sina's escaping for class/dotted tickers; historical providers still support them.
  return /^[A-Z][A-Z0-9]{0,14}$/.test(symbol) ? `gb_${symbol.toLowerCase()}` : null;
}

function positiveSinaPrice(value: string | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Pure evidence parser: now is explicit, no current/previous/after-hours price substitution. */
export function parseSinaSessionClose(payload: unknown, rawSymbol: string, sessionDate: string, now: Date): UnifiedCloseQuote | null {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol || !Number.isFinite(now.getTime())) return null;
  const sinaSymbol = sinaSymbolForClose(symbol);
  const market = /^\d{6}\.(?:SH|SZ|BJ)$/.test(symbol) ? 'A' : 'US';
  if (!sinaSymbol || !isUnifiedMarketCloseCompleted(sessionDate, market, now)) return null;
  const text = typeof payload === 'string' ? payload
    : payload instanceof Uint8Array ? new TextDecoder('gb18030').decode(payload) : null;
  if (!text || text.length > 65_536) return null;
  // Fetch one symbol. Reject wrong variable, duplicate assignments and malformed envelopes.
  const match = /^\s*var\s+hq_str_([A-Za-z0-9_]+)\s*=\s*"([^"\r\n]*)";?\s*$/.exec(text);
  if (!match || match[1] !== sinaSymbol) return null;
  const parts = match[2].split(',');
  if (market === 'A') {
    if (parts.length < 32 || parts[30] !== sessionDate
      || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(parts[31])) return null;
    const quoteAt = Date.parse(`${parts[30]}T${parts[31]}+08:00`);
    const price = positiveSinaPrice(parts[3]);
    if (price === null || !Number.isFinite(quoteAt)
      || quoteAt < Date.parse(`${sessionDate}T15:00:00+08:00`) || quoteAt > now.getTime()) return null;
    return { price, currency: 'CNY', source: 'unified_close_sina', updatedAt: now.toISOString(), priceDate: sessionDate };
  }
  // [1] regular price; [25] regular timestamp; [29] explicit year.
  // [21] price and [24] timestamp are AFTER HOURS and are never read here.
  if (parts.length < 30 || !/^\d{4}$/.test(parts[29]) || Number(parts[29]) < 1900) return null;
  const stamp = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{2}):([0-5]\d)(AM|PM)\s+(EST|EDT)$/.exec(parts[25]);
  // The shared calendar does not specify early-close hours: reject 13:00 fail-closed.
  if (!stamp || stamp[3] !== '04' || stamp[4] !== '00' || stamp[5] !== 'PM') return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = `${parts[29]}-${String(months.indexOf(stamp[1]) + 1).padStart(2, '0')}-${stamp[2].padStart(2, '0')}`;
  if (date !== sessionDate || !isValidCloseSessionDate(date)) return null;
  const regularAt = Date.parse(`${date}T16:00:00${stamp[6] === 'EST' ? '-05:00' : '-04:00'}`);
  if (!Number.isFinite(regularAt) || regularAt > now.getTime()) return null;
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  }).formatToParts(new Date(regularAt));
  const get = (type: Intl.DateTimeFormatPartTypes) => nyParts.find(part => part.type === type)?.value || '';
  // Validate the claimed offset against the actual NY date/time/DST, not Beijing's date.
  if (`${get('year')}-${get('month')}-${get('day')}` !== date
    || get('hour') !== '16' || get('minute') !== '00' || get('timeZoneName') !== stamp[6]) return null;
  const price = positiveSinaPrice(parts[1]);
  return price === null ? null
    : { price, currency: 'USD', source: 'unified_close_sina', updatedAt: now.toISOString(), priceDate: sessionDate };
}

async function fetchSinaSessionClose(symbol: string, sessionDate: string): Promise<UnifiedCloseQuote | null> {
  const sinaSymbol = sinaSymbolForClose(symbol);
  if (!sinaSymbol) return null;
  try {
    const response = await fetch(`https://hq.sinajs.cn/list=${encodeURIComponent(sinaSymbol)}`, {
      headers: { Referer: 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return parseSinaSessionClose(new Uint8Array(await response.arrayBuffer()), symbol, sessionDate, new Date());
  } catch { return null; }
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
      const now = new Date();
      const today = marketDateFromTimestamp(now.getTime() / 1000, market)!;
      // At A_D15:05 prefer the available domestic endpoint for A_D and the latest completed NY close.
      // Older dates keep historical daily providers first; Sina must still prove the exact date.
      const latestClose = market === 'A' || isUnifiedMarketCloseCompleted(today, market, now)
        ? today : previousStockMarketSession(today, market);
      const preferSina = sessionDate === latestClose;
      const quote = (preferSina ? await fetchSinaSessionClose(symbol, sessionDate) : null)
        || await fetchTushareSessionClose(symbol, sessionDate)
        || await fetchYahooSessionClose(symbol, sessionDate)
        || (!preferSina ? await fetchSinaSessionClose(symbol, sessionDate) : null);
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
