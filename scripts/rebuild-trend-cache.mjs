/**
 * 重建 ts_trend_cache 中数据量异常日期的缓存
 * 先找出缓存中 above+below+equal_cnt 总数与 ts_daily 实际数量不一致的日期，重新计算
 */
import mysql from 'mysql2/promise';

const DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

async function main() {
  const conn = await mysql.createConnection({
    uri: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 60000,
  });

  // 找出缓存总数与实际数量差距超过10%的日期
  const [mismatch] = await conn.execute(`
    SELECT c.trade_date, 
           c.above + c.below + c.equal_cnt AS cached_total,
           d.actual_cnt
    FROM ts_trend_cache c
    JOIN (
      SELECT trade_date, COUNT(*) AS actual_cnt FROM ts_daily GROUP BY trade_date
    ) d ON c.trade_date = d.trade_date
    WHERE ABS((c.above + c.below + c.equal_cnt) - d.actual_cnt) > d.actual_cnt * 0.1
    ORDER BY c.trade_date
  `);

  console.log(`需要重建缓存的日期：${mismatch.length} 个`);

  // 获取所有股票的首日开盘价（全量，一次性）
  console.log('加载首日开盘价...');
  const [firstOpenRows] = await conn.execute(`
    SELECT d.ts_code, d.open AS first_open
    FROM ts_daily d
    INNER JOIN (
      SELECT ts_code, MIN(trade_date) AS min_date FROM ts_daily GROUP BY ts_code
    ) fm ON fm.ts_code = d.ts_code AND fm.min_date = d.trade_date
    WHERE d.open > 0
  `);
  const firstOpenMap = {};
  for (const r of firstOpenRows) {
    firstOpenMap[r.ts_code] = parseFloat(r.first_open);
  }
  console.log(`首日开盘价加载完成：${Object.keys(firstOpenMap).length} 只股票`);

  let rebuilt = 0;
  for (const row of mismatch) {
    const td = row.trade_date;
    
    // 查该交易日所有股票的收盘价
    const [dailyRows] = await conn.execute(
      `SELECT ts_code, close FROM ts_daily WHERE trade_date = ? AND close > 0`,
      [td]
    );

    let above = 0, below = 0, equal = 0;
    for (const d of dailyRows) {
      const firstOpen = firstOpenMap[d.ts_code];
      if (!firstOpen) continue;
      const ratio = parseFloat(d.close) / firstOpen;
      if (ratio > 1.001) above++;
      else if (ratio < 0.999) below++;
      else equal++;
    }

    // 更新缓存
    await conn.execute(
      `INSERT INTO ts_trend_cache (trade_date, market, above, below, equal_cnt)
       VALUES (?, 'all', ?, ?, ?)
       ON DUPLICATE KEY UPDATE above=VALUES(above), below=VALUES(below), equal_cnt=VALUES(equal_cnt)`,
      [td, above, below, equal]
    );

    rebuilt++;
    if (rebuilt % 10 === 0) {
      console.log(`进度: ${rebuilt}/${mismatch.length} - 最新: ${td} (above=${above}, below=${below}, equal=${equal})`);
    }
  }

  console.log(`✅ 趋势缓存重建完成：${rebuilt} 个日期已更新`);
  await conn.end();
}

main().catch(console.error);
