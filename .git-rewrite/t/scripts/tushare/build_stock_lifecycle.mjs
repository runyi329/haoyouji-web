/**
 * build_stock_lifecycle.mjs
 * 预计算每只股票全生命周期涨/跌/平天数，存入 ts_stock_lifecycle 表
 * 运行: node scripts/tushare/build_stock_lifecycle.mjs
 */
import mysql from 'mysql2/promise';

const DB_URL = process.env.ORIGINAL_DATABASE_URL || "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

async function main() {
  const conn = await mysql.createConnection({
    uri: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 30000,
    // 允许长时间查询
    multipleStatements: true,
  });

  console.log('[build_stock_lifecycle] 连接数据库成功');

  try {
    // 1. 建表（如不存在）
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ts_stock_lifecycle (
        ts_code VARCHAR(20) NOT NULL PRIMARY KEY,
        up_days INT NOT NULL DEFAULT 0,
        down_days INT NOT NULL DEFAULT 0,
        flat_days INT NOT NULL DEFAULT 0,
        total_days INT NOT NULL DEFAULT 0,
        up_rate DECIMAL(5,1) NOT NULL DEFAULT 0.0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[build_stock_lifecycle] 表已就绪');

    // 2. 全量重建（INSERT INTO ... SELECT，利用数据库服务器本地计算，速度快）
    console.log('[build_stock_lifecycle] 开始计算（可能需要 1-3 分钟）...');
    const t0 = Date.now();

    await conn.execute(`SET SESSION wait_timeout = 600`);
    await conn.execute(`SET SESSION interactive_timeout = 600`);
    await conn.execute(`SET SESSION net_read_timeout = 600`);
    await conn.execute(`SET SESSION net_write_timeout = 600`);

    await conn.execute(`
      INSERT INTO ts_stock_lifecycle (ts_code, up_days, down_days, flat_days, total_days, up_rate)
      SELECT
        ts_code,
        SUM(CASE WHEN pct_chg > 0 THEN 1 ELSE 0 END) AS up_days,
        SUM(CASE WHEN pct_chg < 0 THEN 1 ELSE 0 END) AS down_days,
        SUM(CASE WHEN pct_chg = 0 THEN 1 ELSE 0 END) AS flat_days,
        COUNT(*) AS total_days,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(SUM(CASE WHEN pct_chg > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1)
          ELSE 0 END AS up_rate
      FROM ts_daily
      GROUP BY ts_code
      ON DUPLICATE KEY UPDATE
        up_days   = VALUES(up_days),
        down_days = VALUES(down_days),
        flat_days = VALUES(flat_days),
        total_days = VALUES(total_days),
        up_rate   = VALUES(up_rate),
        updated_at = NOW()
    `);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[build_stock_lifecycle] 计算完成，耗时 ${elapsed}s`);

    // 3. 验证
    const [cnt] = await conn.execute("SELECT COUNT(*) AS cnt FROM ts_stock_lifecycle");
    console.log(`[build_stock_lifecycle] 共写入 ${cnt[0].cnt} 条记录`);

    const [sample] = await conn.execute(
      "SELECT ts_code, up_days, down_days, flat_days, total_days, up_rate FROM ts_stock_lifecycle ORDER BY up_rate DESC LIMIT 3"
    );
    console.log('[build_stock_lifecycle] 涨幅最高前3:', JSON.stringify(sample));

  } finally {
    await conn.end();
    console.log('[build_stock_lifecycle] 完成');
  }
}

main().catch(err => {
  console.error('[build_stock_lifecycle] 失败:', err.message);
  process.exit(1);
});
