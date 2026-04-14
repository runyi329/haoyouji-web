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
            DATE_FORMAT(date, '%y/%m/%d') as date,
            open, high, low, close,
            volume,
            quote_volume as quoteVolume,
            change_pct as changePct,
            amplitude_pct as amplitudePct
     FROM crypto_klines
     WHERE symbol = ?
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
