/**
 * build_us_stock_lifecycle.mjs
 * 从 Tushare 拉取美股全历史日线数据，计算每只股票全生命周期涨/跌/平天数
 * 存入 us_daily（原始数据）和 us_stock_lifecycle（汇总统计）表
 *
 * 运行: node scripts/tushare/build_us_stock_lifecycle.mjs
 *
 * 策略：
 * 1. 先从 Tushare us_basic 拉取全部美股列表（约1万只）
 * 2. 对每只股票，调用 us_daily 按时间段分批拉取全历史数据（每次最多6000条）
 * 3. 直接计算涨/跌/平天数，写入 us_stock_lifecycle
 * 4. 断点续传：已处理的股票跳过
 * 5. 频率控制：每次请求后等待 1.2 秒（避免超限）
 */
import mysql from 'mysql2/promise';

const DB_URL = process.env.ORIGINAL_DATABASE_URL || "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79';
const TUSHARE_URL = 'http://api.tushare.pro';

// 请求间隔（毫秒）
const REQUEST_INTERVAL_MS = 1200;
// 每次拉取的最大条数
const LIMIT_PER_REQUEST = 6000;

let conn;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callTushare(api_name, params, fields = '') {
  const body = JSON.stringify({
    api_name,
    token: TUSHARE_TOKEN,
    params,
    fields,
  });
  const resp = await fetch(TUSHARE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const json = await resp.json();
  if (json.code !== 0) {
    throw new Error(`Tushare error: ${json.msg} (code=${json.code})`);
  }
  return json.data;
}

async function initTables() {
  // us_daily 表：存储原始日线数据
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS us_daily (
      ts_code    VARCHAR(20)  NOT NULL,
      trade_date VARCHAR(8)   NOT NULL,
      open       DECIMAL(12,4),
      high       DECIMAL(12,4),
      low        DECIMAL(12,4),
      close      DECIMAL(12,4),
      pre_close  DECIMAL(12,4),
      \`change\`   DECIMAL(12,4),
      pct_chg    DECIMAL(10,4),
      vol        DECIMAL(20,4),
      amount     DECIMAL(20,4),
      PRIMARY KEY (ts_code, trade_date),
      INDEX idx_trade_date (trade_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // us_stock_lifecycle 表：汇总统计
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS us_stock_lifecycle (
      ts_code    VARCHAR(20)  NOT NULL PRIMARY KEY,
      name       VARCHAR(100),
      enname     VARCHAR(200),
      classify   VARCHAR(10),
      list_date  VARCHAR(8),
      delist_date VARCHAR(8),
      up_days    INT NOT NULL DEFAULT 0,
      down_days  INT NOT NULL DEFAULT 0,
      flat_days  INT NOT NULL DEFAULT 0,
      total_days INT NOT NULL DEFAULT 0,
      up_rate    DECIMAL(5,1) NOT NULL DEFAULT 0.0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('[init] 表结构已就绪');
}

async function fetchAllUsBasic() {
  console.log('[us_basic] 开始拉取美股列表...');
  const allStocks = [];
  let offset = 0;
  const limit = 6000;

  while (true) {
    await sleep(REQUEST_INTERVAL_MS);
    const data = await callTushare('us_basic', { offset: String(offset), limit: String(limit) }, 'ts_code,name,enname,classify,list_date,delist_date');
    const fields = data.fields;
    const items = data.items;
    if (!items || items.length === 0) break;

    const tsIdx = fields.indexOf('ts_code');
    const nameIdx = fields.indexOf('name');
    const ennameIdx = fields.indexOf('enname');
    const classifyIdx = fields.indexOf('classify');
    const listDateIdx = fields.indexOf('list_date');
    const delistDateIdx = fields.indexOf('delist_date');

    for (const row of items) {
      allStocks.push({
        tsCode: String(row[tsIdx] || ''),
        name: row[nameIdx] ? String(row[nameIdx]) : null,
        enname: row[ennameIdx] ? String(row[ennameIdx]) : null,
        classify: row[classifyIdx] ? String(row[classifyIdx]) : null,
        listDate: row[listDateIdx] ? String(row[listDateIdx]) : null,
        delistDate: row[delistDateIdx] ? String(row[delistDateIdx]) : null,
      });
    }

    console.log(`[us_basic] 已拉取 ${allStocks.length} 只股票 (offset=${offset})`);
    if (items.length < limit) break;
    offset += limit;
  }

  console.log(`[us_basic] 共 ${allStocks.length} 只股票`);
  return allStocks;
}

async function fetchStockHistory(tsCode, listDate) {
  // 确定起始年份
  const startYear = listDate ? parseInt(listDate.slice(0, 4)) : 1990;
  const currentYear = new Date().getFullYear();

  let allItems = [];
  let allFields = null;

  // 按年份分段拉取（每段最多10年，避免超过6000条限制）
  for (let y = startYear; y <= currentYear; y += 10) {
    const startDate = `${y}0101`;
    const endDate = `${Math.min(y + 9, currentYear)}1231`;

    await sleep(REQUEST_INTERVAL_MS);
    try {
      const data = await callTushare(
        'us_daily',
        { ts_code: tsCode, start_date: startDate, end_date: endDate },
        'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount'
      );
      if (data && data.items && data.items.length > 0) {
        if (!allFields) allFields = data.fields;
        allItems = allItems.concat(data.items);
      }
    } catch (e) {
      console.warn(`[${tsCode}] 拉取 ${startDate}-${endDate} 失败: ${e.message}`);
    }
  }

  return { fields: allFields, items: allItems };
}

async function processStock(stock, idx, total) {
  const { tsCode, name, enname, classify, listDate, delistDate } = stock;

  // 检查是否已处理
  const [existing] = await conn.execute(
    'SELECT ts_code FROM us_stock_lifecycle WHERE ts_code = ? AND total_days > 0',
    [tsCode]
  );
  if (existing.length > 0) {
    // 已有数据，跳过
    return { skipped: true };
  }

  try {
    const { fields, items } = await fetchStockHistory(tsCode, listDate);

    let upDays = 0, downDays = 0, flatDays = 0, totalDays = 0;

    if (fields && items && items.length > 0) {
      const pctIdx = fields.indexOf('pct_chg');
      for (const row of items) {
        const pct = Number(row[pctIdx]) || 0;
        totalDays++;
        if (pct > 0) upDays++;
        else if (pct < 0) downDays++;
        else flatDays++;
      }
    }

    const upRate = totalDays > 0 ? ((upDays / totalDays) * 100).toFixed(1) : '0.0';

    // 写入 us_stock_lifecycle
    await conn.execute(`
      INSERT INTO us_stock_lifecycle 
        (ts_code, name, enname, classify, list_date, delist_date, up_days, down_days, flat_days, total_days, up_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        enname = VALUES(enname),
        classify = VALUES(classify),
        list_date = VALUES(list_date),
        delist_date = VALUES(delist_date),
        up_days = VALUES(up_days),
        down_days = VALUES(down_days),
        flat_days = VALUES(flat_days),
        total_days = VALUES(total_days),
        up_rate = VALUES(up_rate),
        updated_at = NOW()
    `, [tsCode, name, enname, classify, listDate, delistDate, upDays, downDays, flatDays, totalDays, upRate]);

    console.log(`[${idx}/${total}] ${tsCode} (${name || enname || '?'}) 涨${upDays}天 跌${downDays}天 共${totalDays}天 涨幅${upRate}%`);
    return { processed: true, totalDays };

  } catch (e) {
    console.error(`[${idx}/${total}] ${tsCode} 处理失败: ${e.message}`);
    // 写入空记录，避免重复处理
    await conn.execute(`
      INSERT IGNORE INTO us_stock_lifecycle 
        (ts_code, name, enname, classify, list_date, delist_date, up_days, down_days, flat_days, total_days, up_rate)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0.0)
    `, [tsCode, name, enname, classify, listDate, delistDate]);
    return { error: true };
  }
}

async function main() {
  console.log('[build_us_stock_lifecycle] 开始...');
  const t0 = Date.now();

  conn = await mysql.createConnection({
    uri: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 30000,
  });
  console.log('[build_us_stock_lifecycle] 数据库连接成功');

  try {
    await initTables();

    // 1. 拉取美股列表
    const stocks = await fetchAllUsBasic();

    // 2. 逐只处理
    let processed = 0, skipped = 0, errors = 0;
    for (let i = 0; i < stocks.length; i++) {
      const result = await processStock(stocks[i], i + 1, stocks.length);
      if (result.skipped) skipped++;
      else if (result.error) errors++;
      else processed++;

      // 每100只输出进度
      if ((i + 1) % 100 === 0) {
        const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
        const remaining = ((stocks.length - i - 1) * REQUEST_INTERVAL_MS * 2 / 1000 / 60).toFixed(0);
        console.log(`\n=== 进度: ${i + 1}/${stocks.length} | 已处理:${processed} 跳过:${skipped} 错误:${errors} | 已用:${elapsed}分 预剩:${remaining}分 ===\n`);
      }
    }

    const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
    console.log(`\n[完成] 总计 ${stocks.length} 只股票 | 处理:${processed} 跳过:${skipped} 错误:${errors} | 耗时:${elapsed}分`);

    // 验证
    const [cnt] = await conn.execute("SELECT COUNT(*) AS cnt, SUM(total_days) AS total FROM us_stock_lifecycle WHERE total_days > 0");
    console.log(`[验证] 有效记录: ${cnt[0].cnt} 只, 总交易日数: ${cnt[0].total}`);

    const [top] = await conn.execute(
      "SELECT ts_code, name, up_days, down_days, total_days, up_rate FROM us_stock_lifecycle ORDER BY up_rate DESC LIMIT 5"
    );
    console.log('[验证] 涨幅最高前5:', JSON.stringify(top));

  } finally {
    await conn.end();
    console.log('[build_us_stock_lifecycle] 完成');
  }
}

main().catch(err => {
  console.error('[build_us_stock_lifecycle] 致命错误:', err.message);
  process.exit(1);
});
