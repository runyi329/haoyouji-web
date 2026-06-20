/**
 * 预计算所有数字币对的相关性统计并写入 crypto_correlation_stats 表
 * 用法: node scripts/compute-correlation.mjs
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

// 生产服务器上：DATABASE_URL 指向腾讯云数据库（crypto_klines 在此）
// 本地开发时 ORIGINAL_DATABASE_URL 指向 TiDB Cloud（没有 crypto_klines）
const DB_URL = process.env.DATABASE_URL || process.env.ORIGINAL_DATABASE_URL || 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';
console.log('使用数据库:', DB_URL.replace(/\/\/.*:.*@/, '//***:***@'));

console.log('🔗 连接数据库...');
const conn = await mysql.createConnection(DB_URL);

// 建表
await conn.execute(`
  CREATE TABLE IF NOT EXISTS crypto_correlation_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    base_symbol VARCHAR(20) NOT NULL,
    compare_symbol VARCHAR(20) NOT NULL,
    date_start VARCHAR(20) NOT NULL,
    date_end VARCHAR(20) NOT NULL,
    total_days INT NOT NULL DEFAULT 0,
    both_up INT NOT NULL DEFAULT 0,
    base_up_comp_down INT NOT NULL DEFAULT 0,
    both_down INT NOT NULL DEFAULT 0,
    base_down_comp_up INT NOT NULL DEFAULT 0,
    same_direction INT NOT NULL DEFAULT 0,
    opposite_direction INT NOT NULL DEFAULT 0,
    same_direction_pct DECIMAL(5,1) NOT NULL DEFAULT 0,
    opposite_direction_pct DECIMAL(5,1) NOT NULL DEFAULT 0,
    valid_days INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pair (base_symbol, compare_symbol)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
console.log('✅ 表已就绪');

const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
let savedPairs = 0;

for (const base of symbols) {
  for (const comp of symbols) {
    if (base === comp) continue;

    // 取共同有数据的日期
    const [dateRows] = await conn.execute(
      `SELECT DATE_FORMAT(date, '%Y-%m-%d') as d
       FROM crypto_klines WHERE symbol = ? AND change_pct IS NOT NULL
       AND date IN (
         SELECT date FROM crypto_klines WHERE symbol = ? AND change_pct IS NOT NULL
       )
       ORDER BY d ASC`,
      [base, comp]
    );

    const commonDates = dateRows.map(r => r.d);
    if (commonDates.length === 0) {
      console.log(`⚠️  ${base} vs ${comp}: 无共同数据`);
      continue;
    }

    const startDate = commonDates[0];
    const endDate = commonDates[commonDates.length - 1];

    // 取基准币涨跌
    const [baseRows] = await conn.execute(
      `SELECT DATE_FORMAT(date, '%Y-%m-%d') as d, change_pct
       FROM crypto_klines WHERE symbol = ? AND date BETWEEN ? AND ? AND change_pct IS NOT NULL`,
      [base, startDate, endDate]
    );

    const baseMap = new Map();
    for (const r of baseRows) baseMap.set(r.d, parseFloat(r.change_pct));

    // 取对比币涨跌
    const [compRows] = await conn.execute(
      `SELECT DATE_FORMAT(date, '%Y-%m-%d') as d, change_pct
       FROM crypto_klines WHERE symbol = ? AND date BETWEEN ? AND ? AND change_pct IS NOT NULL`,
      [comp, startDate, endDate]
    );

    let bothUp = 0, baseUpCompDown = 0, bothDown = 0, baseDownCompUp = 0;
    for (const r of compRows) {
      const baseChg = baseMap.get(r.d);
      if (baseChg == null) continue;
      const compChg = parseFloat(r.change_pct);
      if (baseChg > 0 && compChg > 0) bothUp++;
      else if (baseChg > 0 && compChg <= 0) baseUpCompDown++;
      else if (baseChg <= 0 && compChg <= 0) bothDown++;
      else if (baseChg <= 0 && compChg > 0) baseDownCompUp++;
    }

    const validDays = bothUp + baseUpCompDown + bothDown + baseDownCompUp;
    const sameDirection = bothUp + bothDown;
    const oppositeDirection = baseUpCompDown + baseDownCompUp;
    const samePct = validDays > 0 ? Math.round((sameDirection / validDays) * 1000) / 10 : 0;
    const oppPct = validDays > 0 ? Math.round((oppositeDirection / validDays) * 1000) / 10 : 0;

    await conn.execute(
      `INSERT INTO crypto_correlation_stats
         (base_symbol, compare_symbol, date_start, date_end, total_days,
          both_up, base_up_comp_down, both_down, base_down_comp_up,
          same_direction, opposite_direction, same_direction_pct, opposite_direction_pct, valid_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         date_start=VALUES(date_start), date_end=VALUES(date_end), total_days=VALUES(total_days),
         both_up=VALUES(both_up), base_up_comp_down=VALUES(base_up_comp_down),
         both_down=VALUES(both_down), base_down_comp_up=VALUES(base_down_comp_up),
         same_direction=VALUES(same_direction), opposite_direction=VALUES(opposite_direction),
         same_direction_pct=VALUES(same_direction_pct), opposite_direction_pct=VALUES(opposite_direction_pct),
         valid_days=VALUES(valid_days), updated_at=NOW()`,
      [base, comp, startDate, endDate, commonDates.length,
       bothUp, baseUpCompDown, bothDown, baseDownCompUp,
       sameDirection, oppositeDirection, samePct, oppPct, validDays]
    );

    savedPairs++;
    console.log(`✅ ${base} vs ${comp}: 共${commonDates.length}天，同向${sameDirection}天(${samePct}%)，反向${oppositeDirection}天(${oppPct}%)`);
  }
}

await conn.end();
console.log(`\n🎉 完成！共写入 ${savedPairs} 个币对`);
