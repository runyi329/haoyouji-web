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
