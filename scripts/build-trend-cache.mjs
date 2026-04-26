/**
 * build-trend-cache.mjs
 * 预计算每个交易日的 above/below/equal 数量，写入 ts_trend_cache 表
 * 支持增量更新（只计算缓存中没有的交易日）
 */
import mysql from 'mysql2/promise';

const dbUrl = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const conn = await mysql.createConnection({ uri: dbUrl, ssl: { rejectUnauthorized: false }, connectTimeout: 60000 });

console.log('[build-trend-cache] 开始...');

// 1. 确保缓存表存在
await conn.execute(`
  CREATE TABLE IF NOT EXISTS ts_trend_cache (
    trade_date VARCHAR(8) NOT NULL,
    market VARCHAR(10) NOT NULL DEFAULT 'all',
    above INT NOT NULL DEFAULT 0,
    below INT NOT NULL DEFAULT 0,
    equal_cnt INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (trade_date, market)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);

// 2. 获取所有交易日
const [allDayRows] = await conn.execute('SELECT DISTINCT trade_date FROM ts_daily ORDER BY trade_date ASC');
const allDays = allDayRows.map(r => r.trade_date);
console.log(`[build-trend-cache] 共 ${allDays.length} 个交易日`);

// 3. 获取已有缓存的交易日
const [cachedRows] = await conn.execute("SELECT DISTINCT trade_date FROM ts_trend_cache WHERE market = 'all'");
const cachedSet = new Set(cachedRows.map(r => r.trade_date));
const missingDays = allDays.filter(d => !cachedSet.has(d));
console.log(`[build-trend-cache] 已缓存 ${cachedSet.size} 天，需补充 ${missingDays.length} 天`);

if (missingDays.length === 0) {
  console.log('[build-trend-cache] 缓存已是最新，无需更新');
  await conn.end();
  process.exit(0);
}

// 4. 获取每只股票的首日开盘价（一次性加载到内存）
console.log('[build-trend-cache] 加载首日开盘价...');
const [firstOpenRows] = await conn.execute(`
  SELECT d.ts_code, d.open AS first_open
  FROM ts_daily d
  INNER JOIN (SELECT ts_code, MIN(trade_date) AS min_date FROM ts_daily GROUP BY ts_code) fm
    ON fm.ts_code = d.ts_code AND fm.min_date = d.trade_date
  WHERE d.open > 0
`);
const firstOpenMap = {};
for (const r of firstOpenRows) {
  firstOpenMap[r.ts_code] = parseFloat(r.first_open);
}
console.log(`[build-trend-cache] 首日开盘价加载完成，共 ${Object.keys(firstOpenMap).length} 只股票`);

// 5. 分批处理缺失的交易日（每批10天，避免内存压力）
const BATCH_SIZE = 10;
let processed = 0;

for (let i = 0; i < missingDays.length; i += BATCH_SIZE) {
  const batch = missingDays.slice(i, i + BATCH_SIZE);
  const minDay = batch[0];
  const maxDay = batch[batch.length - 1];

  // 取这批交易日的所有收盘价
  const [dailyRows] = await conn.execute(
    `SELECT ts_code, trade_date, close FROM ts_daily WHERE trade_date >= ? AND trade_date <= ? AND close > 0`,
    [minDay, maxDay]
  );

  // 按交易日聚合
  const dayMap = {};
  for (const d of dailyRows) {
    const td = d.trade_date;
    const fo = firstOpenMap[d.ts_code];
    if (!fo) continue;
    if (!dayMap[td]) dayMap[td] = { above: 0, below: 0, equal: 0 };
    const ratio = parseFloat(d.close) / fo;
    if (ratio > 1.001) dayMap[td].above++;
    else if (ratio < 0.999) dayMap[td].below++;
    else dayMap[td].equal++;
  }

  // 写入缓存
  for (const td of batch) {
    const d = dayMap[td];
    if (!d) continue; // 该天无数据（可能是节假日）
    await conn.execute(
      `INSERT INTO ts_trend_cache (trade_date, market, above, below, equal_cnt)
       VALUES (?, 'all', ?, ?, ?)
       ON DUPLICATE KEY UPDATE above=VALUES(above), below=VALUES(below), equal_cnt=VALUES(equal_cnt)`,
      [td, d.above, d.below, d.equal]
    );
  }

  processed += batch.length;
  const pct = ((i + batch.length) / missingDays.length * 100).toFixed(1);
  console.log(`[build-trend-cache] 进度: ${processed}/${missingDays.length} (${pct}%) - 最新日期: ${maxDay}`);
}

// 6. 验证结果
const [finalCnt] = await conn.execute('SELECT COUNT(*) AS cnt FROM ts_trend_cache');
console.log(`[build-trend-cache] 完成！缓存总行数: ${finalCnt[0].cnt}`);

await conn.end();
