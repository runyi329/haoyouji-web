/**
 * build-trend-cache-markets-fast.mjs
 * 高速版：用 SQL 直接在数据库层聚合，一次性写入所有板块缓存
 * 原理：用 INSERT INTO ... SELECT 直接完成聚合+写入，无需 Node.js 逐行处理
 */
import mysql from 'mysql2/promise';

const dbUrl = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const conn = await mysql.createConnection({ 
  uri: dbUrl, 
  ssl: { rejectUnauthorized: false }, 
  connectTimeout: 60000,
  // 增大超时，聚合查询可能需要较长时间
});

// 设置较长的查询超时
await conn.execute('SET SESSION wait_timeout = 3600');
await conn.execute('SET SESSION interactive_timeout = 3600');
await conn.execute('SET SESSION net_read_timeout = 600');
await conn.execute('SET SESSION net_write_timeout = 600');

const MARKET_FILTERS = {
  SH:   "d.ts_code LIKE '6%' AND d.ts_code NOT LIKE '688%'",
  SZ:   "d.ts_code LIKE '0%'",
  GEM:  "d.ts_code LIKE '3%'",
  STAR: "d.ts_code LIKE '688%'",
};

// 获取所有交易日
const [allDayRows] = await conn.execute('SELECT DISTINCT trade_date FROM ts_daily ORDER BY trade_date ASC');
const allDays = allDayRows.map(r => r.trade_date);
console.log(`共 ${allDays.length} 个交易日`);

for (const [market, filter] of Object.entries(MARKET_FILTERS)) {
  // 检查已有缓存
  const [cachedRows] = await conn.execute(
    `SELECT DISTINCT trade_date FROM ts_trend_cache WHERE market = ?`, [market]
  );
  const cachedSet = new Set(cachedRows.map(r => r.trade_date));
  const missingDays = allDays.filter(d => !cachedSet.has(d));
  console.log(`\n[${market}] 需补充 ${missingDays.length} 天（已有 ${cachedSet.size} 天）`);
  if (missingDays.length === 0) {
    console.log(`[${market}] 已完成，跳过`);
    continue;
  }

  // 分批处理，每批 100 天，用 SQL 聚合
  const BATCH_SIZE = 100;
  let processed = 0;

  for (let i = 0; i < missingDays.length; i += BATCH_SIZE) {
    const batch = missingDays.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');

    // 用 SQL 直接聚合：JOIN 首日开盘价，按交易日统计三类数量，批量 INSERT
    const sql = `
      INSERT INTO ts_trend_cache (trade_date, market, above, below, equal_cnt)
      SELECT 
        d.trade_date,
        '${market}' AS market,
        SUM(CASE WHEN (d.close - fo.first_open) / fo.first_open > 0.001 THEN 1 ELSE 0 END) AS above,
        SUM(CASE WHEN (d.close - fo.first_open) / fo.first_open < -0.001 THEN 1 ELSE 0 END) AS below,
        SUM(CASE WHEN ABS((d.close - fo.first_open) / fo.first_open) <= 0.001 THEN 1 ELSE 0 END) AS equal_cnt
      FROM ts_daily d
      INNER JOIN (
        SELECT ts_code, MIN(trade_date) AS min_date FROM ts_daily GROUP BY ts_code
      ) fm ON fm.ts_code = d.ts_code
      INNER JOIN ts_daily fo ON fo.ts_code = d.ts_code AND fo.trade_date = fm.min_date
      WHERE d.trade_date IN (${placeholders})
        AND ${filter}
        AND fo.open > 0
        AND d.close > 0
      GROUP BY d.trade_date
      ON DUPLICATE KEY UPDATE 
        above = VALUES(above),
        below = VALUES(below),
        equal_cnt = VALUES(equal_cnt)
    `;

    try {
      const [result] = await conn.execute(sql, batch);
      processed += batch.length;
      console.log(`  [${market}] 进度: ${processed}/${missingDays.length} (写入 ${result.affectedRows} 行)`);
    } catch (err) {
      console.error(`  [${market}] 批次 ${i}-${i+BATCH_SIZE} 失败: ${err.message}`);
    }
  }

  console.log(`[${market}] 缓存构建完成`);
}

await conn.end();
console.log('\n全部板块缓存构建完成！');
