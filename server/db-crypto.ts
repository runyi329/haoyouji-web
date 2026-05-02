import { getDbConnection } from "./db";

/**
 * 确保 crypto_klines 表存在
 */
export async function ensureCryptoKlinesTable(): Promise<void> {
  const conn = await getDbConnection();
  if (!conn) return;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`crypto_klines\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`symbol\` VARCHAR(20) NOT NULL COMMENT '交易对，如 BTCUSDT',
      \`date\` DATE NOT NULL COMMENT '日期（UTC）',
      \`open\` DECIMAL(20,4) NOT NULL COMMENT '开盘价',
      \`high\` DECIMAL(20,4) NOT NULL COMMENT '最高价',
      \`low\` DECIMAL(20,4) NOT NULL COMMENT '最低价',
      \`close\` DECIMAL(20,4) NOT NULL COMMENT '收盘价',
      \`volume\` DECIMAL(30,4) COMMENT '成交量（币）',
      \`quote_volume\` DECIMAL(30,2) COMMENT '成交额（USDT）',
      \`change_pct\` DECIMAL(10,4) COMMENT '涨跌幅（%）',
      \`amplitude_pct\` DECIMAL(10,4) COMMENT '振幅（%）',
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY \`uk_symbol_date\` (\`symbol\`, \`date\`),
      INDEX \`idx_symbol\` (\`symbol\`),
      INDEX \`idx_date\` (\`date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加密货币历史日线数据'
  `);
}

export interface CryptoKline {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  changePct: number | null;
  amplitudePct: number | null;
}

/**
 * 批量插入 K 线数据（upsert）
 */
export async function batchUpsertCryptoKlines(records: CryptoKline[]): Promise<number> {
  const conn = await getDbConnection();
  if (!conn || records.length === 0) return 0;

  const values = records.map(r => [
    r.symbol,
    r.date,
    r.open,
    r.high,
    r.low,
    r.close,
    r.volume,
    r.quoteVolume,
    r.changePct,
    r.amplitudePct,
  ]);

  const placeholders = values.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',');
  await conn.execute(
    `INSERT INTO crypto_klines (symbol, date, open, high, low, close, volume, quote_volume, change_pct, amplitude_pct)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       open=VALUES(open), high=VALUES(high), low=VALUES(low), close=VALUES(close),
       volume=VALUES(volume), quote_volume=VALUES(quote_volume),
       change_pct=VALUES(change_pct), amplitude_pct=VALUES(amplitude_pct)`,
    values.flat()
  );
  return records.length;
}

/**
 * 查询某个交易对的历史 K 线（分页，最新在前）
 * 日期格式：YY/MM/DD（如 26/04/14）
 */
export async function getCryptoKlines(
  symbol: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ rows: CryptoKline[]; total: number }> {
  const conn = await getDbConnection();
  if (!conn) return { rows: [], total: 0 };

  const safePageSize = Math.min(200, Math.max(1, pageSize));
  const safeOffset = Math.max(0, (page - 1) * safePageSize);

  const [countRows] = await conn.execute(
    `SELECT COUNT(*) as total FROM crypto_klines WHERE symbol = ?`,
    [symbol]
  ) as any[];
  const total = (countRows as any[])[0]?.total ?? 0;

  const [rows] = await conn.execute(
    `SELECT symbol,
            DATE_FORMAT(date, '%Y/%m/%d') as date,
            open, high, low, close,
            volume,
            quote_volume as quoteVolume,
            change_pct as changePct,
            amplitude_pct as amplitudePct
     FROM crypto_klines
     WHERE symbol = ? AND date >= '2000-01-01'
     ORDER BY date DESC
     LIMIT ${safePageSize} OFFSET ${safeOffset}`,
    [symbol]
  ) as any[];

  return {
    rows: (rows as any[]).map(r => ({
      symbol: r.symbol,
      date: r.date,
      open: parseFloat(r.open),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      close: parseFloat(r.close),
      volume: parseFloat(r.volume),
      quoteVolume: parseFloat(r.quoteVolume),
      changePct: r.changePct != null ? parseFloat(r.changePct) : null,
      amplitudePct: r.amplitudePct != null ? parseFloat(r.amplitudePct) : null,
    })),
    total,
  };
}

/**
 * 获取最新一条记录的日期（用于增量更新）
 */
export async function getLatestCryptoDate(symbol: string): Promise<string | null> {
  const conn = await getDbConnection();
  if (!conn) return null;
  const [rows] = await conn.execute(
    `SELECT DATE_FORMAT(MAX(date), '%Y-%m-%d') as latest FROM crypto_klines WHERE symbol = ?`,
    [symbol]
  ) as any[];
  return (rows as any[])[0]?.latest ?? null;
}

/**
 * 从 Binance 拉取增量日线数据并写入数据库
 * 自动从最新日期之后开始拉取，最多拉取 1000 条
 */
export async function syncLatestFromBinance(symbol: string): Promise<{ added: number; latestDate: string | null }> {
  // 1. 查最新日期
  const latestDate = await getLatestCryptoDate(symbol);
  
  // 计算起始时间（最新日期的下一天，或默认从2017-08-17开始）
  let startTime: number;
  if (latestDate) {
    const d = new Date(latestDate);
    d.setDate(d.getDate() + 1); // 从下一天开始
    startTime = d.getTime();
  } else {
    startTime = new Date('2017-08-17').getTime();
  }

  const now = Date.now();
  if (startTime > now) {
    return { added: 0, latestDate };
  }

  // 2. 从 Binance 拉取数据（每次最多1000条）
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startTime}&limit=1000`;
  
  let klines: any[];
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`Binance API error: ${resp.status}`);
    klines = await resp.json();
  } catch (e: any) {
    // 尝试备用域名
    try {
      const url2 = `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startTime}&limit=1000`;
      const resp2 = await fetch(url2, { signal: AbortSignal.timeout(15000) });
      if (!resp2.ok) throw new Error(`Binance API error: ${resp2.status}`);
      klines = await resp2.json();
    } catch (e2: any) {
      throw new Error(`无法连接 Binance API: ${e2.message}`);
    }
  }

  if (!klines || klines.length === 0) {
    return { added: 0, latestDate };
  }

  // 3. 转换格式
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const records: CryptoKline[] = klines
    .filter((k: any) => {
      // 排除今天（当天K线未收盘）
      const kDate = new Date(k[0]);
      kDate.setHours(0, 0, 0, 0);
      return kDate.getTime() < today.getTime();
    })
    .map((k: any) => {
      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const volume = parseFloat(k[5]);
      const quoteVolume = parseFloat(k[7]);
      const changePct = open > 0 ? parseFloat(((close - open) / open * 100).toFixed(4)) : null;
      const amplitudePct = open > 0 ? parseFloat(((high - low) / open * 100).toFixed(4)) : null;
      const dateObj = new Date(k[0]);
      const dateStr = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
      return { symbol, date: dateStr, open, high, low, close, volume, quoteVolume, changePct, amplitudePct };
    });

  if (records.length === 0) {
    return { added: 0, latestDate };
  }

  // 4. 写入数据库
  await batchUpsertCryptoKlines(records);

  const newLatest = records[records.length - 1].date;
  return { added: records.length, latestDate: newLatest };
}

export interface CryptoStats {
  total: number;
  upDays: number;
  downDays: number;
  flatDays: number;
  upPct: number;
  downPct: number;
  // 连涨分布：key=连涨天数, value=出现次数
  consecutiveUp: Record<number, number>;
  // 连跌分布：key=连跌天数, value=出现次数
  consecutiveDown: Record<number, number>;
  // 最长连涨/连跌
  maxConsecUp: number;
  maxConsecDown: number;
}

/**
 * 计算某交易对的涨跌统计和连涨连跌分布
 */
export async function getCryptoStats(symbol: string): Promise<CryptoStats> {
  const conn = await getDbConnection();
  if (!conn) return {
    total: 0, upDays: 0, downDays: 0, flatDays: 0,
    upPct: 0, downPct: 0,
    consecutiveUp: {}, consecutiveDown: {},
    maxConsecUp: 0, maxConsecDown: 0,
  };

  // 按日期升序拉取所有 change_pct
  const [rows] = await conn.execute(
    `SELECT change_pct FROM crypto_klines WHERE symbol = ? ORDER BY date ASC`,
    [symbol]
  ) as any[];

  const changes: (number | null)[] = (rows as any[]).map((r: any) =>
    r.change_pct != null ? parseFloat(r.change_pct) : null
  );

  const total = changes.length;
  let upDays = 0, downDays = 0, flatDays = 0;

  // 连涨/连跌统计
  const consecutiveUp: Record<number, number> = {};
  const consecutiveDown: Record<number, number> = {};
  let maxConsecUp = 0, maxConsecDown = 0;
  let curUp = 0, curDown = 0;

  for (const pct of changes) {
    if (pct == null) continue;
    if (pct > 0) {
      upDays++;
      // 结束连跌序列
      if (curDown > 0) {
        consecutiveDown[curDown] = (consecutiveDown[curDown] ?? 0) + 1;
        if (curDown > maxConsecDown) maxConsecDown = curDown;
        curDown = 0;
      }
      curUp++;
    } else if (pct < 0) {
      downDays++;
      // 结束连涨序列
      if (curUp > 0) {
        consecutiveUp[curUp] = (consecutiveUp[curUp] ?? 0) + 1;
        if (curUp > maxConsecUp) maxConsecUp = curUp;
        curUp = 0;
      }
      curDown++;
    } else {
      flatDays++;
      // 平盘结束两个序列
      if (curUp > 0) {
        consecutiveUp[curUp] = (consecutiveUp[curUp] ?? 0) + 1;
        if (curUp > maxConsecUp) maxConsecUp = curUp;
        curUp = 0;
      }
      if (curDown > 0) {
        consecutiveDown[curDown] = (consecutiveDown[curDown] ?? 0) + 1;
        if (curDown > maxConsecDown) maxConsecDown = curDown;
        curDown = 0;
      }
    }
  }
  // 收尾
  if (curUp > 0) {
    consecutiveUp[curUp] = (consecutiveUp[curUp] ?? 0) + 1;
    if (curUp > maxConsecUp) maxConsecUp = curUp;
  }
  if (curDown > 0) {
    consecutiveDown[curDown] = (consecutiveDown[curDown] ?? 0) + 1;
    if (curDown > maxConsecDown) maxConsecDown = curDown;
  }

  const validTotal = upDays + downDays + flatDays;
  return {
    total,
    upDays,
    downDays,
    flatDays,
    upPct: validTotal > 0 ? parseFloat((upDays / validTotal * 100).toFixed(1)) : 0,
    downPct: validTotal > 0 ? parseFloat((downDays / validTotal * 100).toFixed(1)) : 0,
    consecutiveUp,
    consecutiveDown,
    maxConsecUp,
    maxConsecDown,
  };
}

/**
 * 获取某交易对全量涨跌幅数组（按日期升序），用于前端分段计算连涨连跌统计
 */
export async function getAllChangePcts(symbol: string): Promise<{ date: string; changePct: number | null }[]> {
  const conn = await getDbConnection();
  if (!conn) return [];
  const [rows] = await conn.execute(
    `SELECT DATE_FORMAT(date, '%Y/%m/%d') as date, change_pct as changePct
     FROM crypto_klines WHERE symbol = ? AND date >= '2000-01-01' ORDER BY date ASC`,
    [symbol]
  ) as any[];
  return (rows as any[]).map((r: any) => ({
    date: r.date,
    changePct: r.changePct != null ? parseFloat(r.changePct) : null,
  }));
}


/**
 * 获取指定股票的元数据（从 crypto_klines_meta 表）
 */
export async function getKlinesMeta(symbol: string): Promise<{
  symbol: string;
  total: number;
  oldestDate: string;
  latestDate: string;
} | null> {
  const conn = await getDbConnection();
  const [rows] = await conn.execute(
    `SELECT symbol, total,
       DATE_FORMAT(oldest_date, '%Y/%m/%d') as oldestDate,
       DATE_FORMAT(latest_date, '%Y/%m/%d') as latestDate
     FROM crypto_klines_meta WHERE symbol = ? LIMIT 1`,
    [symbol]
  ) as any[];
  const row = (rows as any[])[0];
  return {
    symbol: row.symbol,
    total: Number(row.total),
    oldestDate: row.oldestDate,
    latestDate: row.latestDate,
  };
}

/**
 * 刷新指定股票的元数据（同步最新日期和条数）
 */
export async function refreshKlinesMeta(symbol: string): Promise<void> {
  const conn = await getDbConnection();
  await conn.execute(
    `INSERT INTO crypto_klines_meta (symbol, total, oldest_date, latest_date)
     SELECT symbol, COUNT(*), MIN(date), MAX(date)
     FROM crypto_klines WHERE symbol = ?
     GROUP BY symbol
     ON DUPLICATE KEY UPDATE
       total = VALUES(total),
       oldest_date = VALUES(oldest_date),
       latest_date = VALUES(latest_date),
       updated_at = CURRENT_TIMESTAMP`,
    [symbol]
  );
}

// ─── 美股相关工具函数 ────────────────────────────────────────────────────────────

/**
 * 判断当前是否为美国夏令时（EDT，UTC-4）
 * 夏令时：3月第2个周日 00:02 ~ 11月第1个周日 02:00（美东时间）
 */
export function isUSDST(date: Date = new Date()): boolean {
  const year = date.getUTCFullYear();

  // 3月第2个周日（UTC时间）
  const marchSecondSunday = (() => {
    const d = new Date(Date.UTC(year, 2, 1)); // 3月1日 UTC
    const dow = d.getUTCDay(); // 0=周日
    const firstSunday = dow === 0 ? 1 : 8 - dow;
    return new Date(Date.UTC(year, 2, firstSunday + 7, 7, 0, 0)); // 02:00 EST = 07:00 UTC
  })();

  // 11月第1个周日（UTC时间）
  const novFirstSunday = (() => {
    const d = new Date(Date.UTC(year, 10, 1)); // 11月1日 UTC
    const dow = d.getUTCDay();
    const firstSunday = dow === 0 ? 1 : 8 - dow;
    return new Date(Date.UTC(year, 10, firstSunday, 6, 0, 0)); // 02:00 EDT = 06:00 UTC
  })();

  return date >= marchSecondSunday && date < novFirstSunday;
}

/**
 * 获取美股当日开盘/收盘时间（北京时间，UTC+8）
 * 夏令时：开盘 21:30，收盘次日 04:00
 * 冬令时：开盘 22:30，收盘次日 05:00
 */
export function getUSMarketHoursBJT(date: Date = new Date()): {
  openHour: number; openMin: number;
  closeHour: number; closeMin: number; closeNextDay: boolean;
} {
  const dst = isUSDST(date);
  return dst
    ? { openHour: 21, openMin: 30, closeHour: 4, closeMin: 0, closeNextDay: true }
    : { openHour: 22, openMin: 30, closeHour: 5, closeMin: 0, closeNextDay: true };
}

/**
 * 美股法定节假日列表（NYSE，按年维护）
 * 格式：YYYY-MM-DD
 */
export function getUSHolidays(year: number): Set<string> {
  const holidays: string[] = [];

  // 元旦（1月1日，若周六则提前至周五，若周日则顺延至周一）
  holidays.push(adjustHoliday(year, 1, 1));
  // 马丁路德金日（1月第3个周一）
  holidays.push(nthWeekday(year, 1, 1, 3));
  // 总统日（2月第3个周一）
  holidays.push(nthWeekday(year, 2, 1, 3));
  // 耶稣受难日（复活节前的周五，需计算）
  holidays.push(getGoodFriday(year));
  // 阵亡将士纪念日（5月最后一个周一）
  holidays.push(lastWeekday(year, 5, 1));
  // 六月节（6月19日，若周六则提前至周五，若周日则顺延至周一）
  holidays.push(adjustHoliday(year, 6, 19));
  // 独立日（7月4日）
  holidays.push(adjustHoliday(year, 7, 4));
  // 劳工节（9月第1个周一）
  holidays.push(nthWeekday(year, 9, 1, 1));
  // 感恩节（11月第4个周四）
  holidays.push(nthWeekday(year, 11, 4, 4));
  // 圣诞节（12月25日）
  holidays.push(adjustHoliday(year, 12, 25));

  return new Set(holidays);
}

function adjustHoliday(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1); // 周六→周五
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // 周日→周一
  return d.toISOString().slice(0, 10);
}

function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  // weekday: 0=周日, 1=周一, ..., 4=周四
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === weekday) {
      count++;
      if (count === nth) return d.toISOString().slice(0, 10);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const d = new Date(Date.UTC(year, month, 0)); // 月末最后一天
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getGoodFriday(year: number): string {
  // 使用高斯算法计算复活节日期
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(Date.UTC(year, month - 1, day));
  easter.setUTCDate(easter.getUTCDate() - 2); // 复活节前2天=耶稣受难日
  return easter.toISOString().slice(0, 10);
}

/**
 * 判断某日期是否为美股交易日
 * @param dateStr YYYY-MM-DD
 */
export function isUSTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false; // 周末
  const year = d.getUTCFullYear();
  const holidays = getUSHolidays(year);
  return !holidays.has(dateStr);
}

/**
 * 获取下一个美股交易日
 * @param fromDateStr YYYY-MM-DD（不含当天）
 */
export function getNextUSTradingDay(fromDateStr: string): string {
  const d = new Date(fromDateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  while (!isUSTradingDay(d.toISOString().slice(0, 10))) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/** 美股七姐妹 symbol 映射（Yahoo Finance ticker） */
export const US_STOCK_SYMBOLS: Record<string, string> = {
  AAPL: 'AAPL',
  MSFT: 'MSFT',
  GOOGL: 'GOOGL',
  AMZN: 'AMZN',
  NVDA: 'NVDA',
  TSLA: 'TSLA',
  META: 'META',
};

/**
 * 从 Yahoo Finance 拉取美股日线数据并写入 crypto_klines
 * symbol 格式：'AAPL'（不带后缀）
 */
export async function syncStockFromYahoo(symbol: string): Promise<{ added: number; latestDate: string | null }> {
  const conn = await getDbConnection();
  if (!conn) throw new Error('DB connection failed');

  // 1. 查最新日期
  const latestDate = await getLatestCryptoDate(symbol);

  let startDate: string;
  if (latestDate) {
    const d = new Date(latestDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    startDate = d.toISOString().slice(0, 10);
  } else {
    startDate = '2010-01-01';
  }

  const now = new Date();
  if (new Date(startDate) > now) {
    return { added: 0, latestDate };
  }

  // 2. 从 Yahoo Finance 拉取
  const period1 = Math.floor(new Date(startDate).getTime() / 1000);
  const period2 = Math.floor(now.getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${period1}&period2=${period2}&events=history`;

  let chartData: any;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`Yahoo Finance API error: ${resp.status}`);
    const json = await resp.json();
    chartData = json?.chart?.result?.[0];
    if (!chartData) throw new Error('Yahoo Finance 返回数据为空');
  } catch (e: any) {
    // 备用：query2
    try {
      const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${period1}&period2=${period2}&events=history`;
      const resp2 = await fetch(url2, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp2.ok) throw new Error(`Yahoo Finance backup error: ${resp2.status}`);
      const json2 = await resp2.json();
      chartData = json2?.chart?.result?.[0];
      if (!chartData) throw new Error('Yahoo Finance 备用返回数据为空');
    } catch (e2: any) {
      throw new Error(`无法连接 Yahoo Finance: ${e2.message}`);
    }
  }

  // 3. 解析数据
  const timestamps: number[] = chartData.timestamp || [];
  const ohlcv = chartData.indicators?.quote?.[0] || {};
  const opens: number[] = ohlcv.open || [];
  const highs: number[] = ohlcv.high || [];
  const lows: number[] = ohlcv.low || [];
  const closes: number[] = ohlcv.close || [];
  const volumes: number[] = ohlcv.volume || [];

  // 今天（UTC）不纳入，当天数据未收盘
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  const records: CryptoKline[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i] || 0;

    if (!open || !close || isNaN(open) || isNaN(close)) continue;

    const dateObj = new Date(ts * 1000);
    dateObj.setUTCHours(0, 0, 0, 0);
    if (dateObj >= todayUTC) continue; // 排除今天

    const dateStr = dateObj.toISOString().slice(0, 10);
    const changePct = open > 0 ? parseFloat(((close - open) / open * 100).toFixed(6)) : null;
    const amplitudePct = open > 0 && high && low ? parseFloat(((high - low) / open * 100).toFixed(6)) : null;

    records.push({
      symbol,
      date: dateStr,
      open,
      high: high || open,
      low: low || open,
      close,
      volume,
      quoteVolume: 0,
      changePct,
      amplitudePct,
    });
  }

  if (records.length === 0) {
    return { added: 0, latestDate };
  }

  await batchUpsertCryptoKlines(records);
  const newLatest = records[records.length - 1].date;
  return { added: records.length, latestDate: newLatest };
}

/**
 * 用 Tushare us_daily 按日期批量同步美股（一次调用拉取当天所有股票）
 * 每天只需 1 次 API 调用，远低于 5次/天 的限额
 */
const TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79';
const TUSHARE_URL = 'http://api.tushare.pro';

// 我们关注的美股代码（Tushare 格式）
const US_STOCK_SYMBOLS_TUSHARE: Record<string, string> = {
  'AAPL': 'AAPL',
  'MSFT': 'MSFT',
  'GOOGL': 'GOOGL',
  'AMZN': 'AMZN',
  'NVDA': 'NVDA',
  'TSLA': 'TSLA',
  'META': 'META',
};

export async function syncStocksFromTushare(): Promise<{ added: number; dates: string[] }> {
  // 找出所有美股中最早的缺失日期
  let earliestStart: Date | null = null;
  for (const sym of Object.keys(US_STOCK_SYMBOLS_TUSHARE)) {
    const latest = await getLatestCryptoDate(sym);
    let startDate: Date;
    if (latest) {
      startDate = new Date(latest + 'T00:00:00Z');
      startDate.setUTCDate(startDate.getUTCDate() + 1);
    } else {
      startDate = new Date('2010-01-01T00:00:00Z');
    }
    if (!earliestStart || startDate < earliestStart) {
      earliestStart = startDate;
    }
  }

  if (!earliestStart) return { added: 0, dates: [] };

  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  if (earliestStart >= now) return { added: 0, dates: [] };

  let totalAdded = 0;
  const processedDates: string[] = [];

  // 按日期逐天拉取（跳过周末）
  const cursor = new Date(earliestStart);
  while (cursor < now) {
    const dayOfWeek = cursor.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }

    const tradeDateStr = cursor.toISOString().slice(0, 10).replace(/-/g, '');
    
    try {
      const resp = await fetch(TUSHARE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_name: 'us_daily',
          token: TUSHARE_TOKEN,
          params: { trade_date: tradeDateStr },
          fields: 'ts_code,trade_date,open,high,low,close,vol',
        }),
        signal: AbortSignal.timeout(15000),
      });

      const json = await resp.json() as any;
      if (json.code !== 0) {
        console.log(`[Tushare us_daily] ${tradeDateStr} 跳过: ${json.msg}`);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      const fields: string[] = json.data?.fields || [];
      const items: any[][] = json.data?.items || [];
      if (items.length === 0) {
        // 无数据说明是假日，跳过
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      const tsCodeIdx = fields.indexOf('ts_code');
      const openIdx = fields.indexOf('open');
      const highIdx = fields.indexOf('high');
      const lowIdx = fields.indexOf('low');
      const closeIdx = fields.indexOf('close');
      const volIdx = fields.indexOf('vol');

      const records: CryptoKline[] = [];
      const dateStr = cursor.toISOString().slice(0, 10);

      for (const item of items) {
        const tsCode: string = item[tsCodeIdx];
        // 只保留我们关注的7只股票
        if (!Object.values(US_STOCK_SYMBOLS_TUSHARE).includes(tsCode)) continue;

        const open = parseFloat(item[openIdx]);
        const high = parseFloat(item[highIdx]);
        const low = parseFloat(item[lowIdx]);
        const close = parseFloat(item[closeIdx]);
        const volume = parseFloat(item[volIdx]) || 0;

        if (!open || !close || isNaN(open) || isNaN(close)) continue;

        const changePct = open > 0 ? parseFloat(((close - open) / open * 100).toFixed(6)) : null;
        const amplitudePct = open > 0 && high && low ? parseFloat(((high - low) / open * 100).toFixed(6)) : null;

        records.push({
          symbol: tsCode,
          date: dateStr,
          open,
          high: high || open,
          low: low || open,
          close,
          volume,
          quoteVolume: 0,
          changePct,
          amplitudePct,
        });
      }

      if (records.length > 0) {
        await batchUpsertCryptoKlines(records);
        totalAdded += records.length;
        processedDates.push(dateStr);
        console.log(`[Tushare us_daily] ${dateStr} 写入 ${records.length} 条`);
      }
    } catch (e: any) {
      console.error(`[Tushare us_daily] ${tradeDateStr} 请求失败:`, e.message);
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
    // 限速：每次请求间隔 600ms，确保不超 2次/分钟
    await new Promise(r => setTimeout(r, 600));
  }

  return { added: totalAdded, dates: processedDates };
}

// ─── 批量获取多个标的最新日线价格（用于美股/数字币首页展示）─────────────────────
export async function getLatestStockPrices(symbols: string[]): Promise<Record<string, {
  symbol: string;
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  changePct: number | null;
  volume: number | null;
  amplitudePct: number | null;
}>> {
  const conn = await getDbConnection();
  if (!conn || symbols.length === 0) return {};
  try {
    const placeholders = symbols.map(() => '?').join(',');
    const [rows] = await (conn as any).execute(
      `SELECT k.symbol, DATE_FORMAT(k.date, '%Y-%m-%d') as date,
              k.open, k.high, k.low, k.close, k.change_pct as changePct,
              k.volume, k.amplitude_pct as amplitudePct
       FROM crypto_klines k
       INNER JOIN (
         SELECT symbol, MAX(date) as max_date
         FROM crypto_klines
         WHERE symbol IN (${placeholders}) AND date >= '2000-01-01'
         GROUP BY symbol
       ) latest ON k.symbol = latest.symbol AND k.date = latest.max_date
       WHERE k.symbol IN (${placeholders})`,
      [...symbols, ...symbols]
    );
    const result: Record<string, any> = {};
    for (const r of rows as any[]) {
      result[r.symbol] = {
        symbol: r.symbol,
        date: r.date,
        close: parseFloat(r.close),
        open: parseFloat(r.open),
        high: parseFloat(r.high),
        low: parseFloat(r.low),
        changePct: r.changePct !== null ? parseFloat(r.changePct) : null,
        volume: r.volume !== null ? parseFloat(r.volume) : null,
        amplitudePct: r.amplitudePct !== null ? parseFloat(r.amplitudePct) : null,
      };
    }
    return result;
  } catch (e) {
    return {};
  }
}
