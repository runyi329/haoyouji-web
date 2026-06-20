/**
 * build-trend-cache-markets.mjs
 * 为沪市(SH)/深市(SZ)/创业板(GEM)/科创板(STAR) 构建趋势缓存
 * 每个板块按首日开盘价对比当日收盘价，统计 above/below/equal
 */
import mysql from 'mysql2/promise';

const dbUrl = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";
const conn = await mysql.createConnection({ uri: dbUrl, ssl: { rejectUnauthorized: false }, connectTimeout: 60000 });

const MARKETS = {
  SH:   "b.ts_code LIKE '6%' AND b.ts_code NOT LIKE '688%'",
  SZ:   "b.ts_code LIKE '0%'",
  GEM:  "b.ts_code LIKE '3%'",
  STAR: "b.ts_code LIKE '688%'",
};

// 获取所有交易日
const [allDayRows] = await conn.execute('SELECT DISTINCT trade_date FROM ts_daily ORDER BY trade_date ASC');
const allDays = allDayRows.map(r => r.trade_date);
console.log(`共 ${allDays.length} 个交易日`);

// 获取每只股票的首日开盘价（一次性加载）
console.log('加载首日开盘价...');
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
console.log(`首日开盘价加载完成，共 ${Object.keys(firstOpenMap).length} 只股票`);

// 按板块过滤股票
console.log('加载板块股票列表...');
const [basicRows] = await conn.execute('SELECT ts_code FROM ts_stock_basic');
const marketStocks = { SH: new Set(), SZ: new Set(), GEM: new Set(), STAR: new Set() };
for (const r of basicRows) {
  const code = r.ts_code;
  if (code.startsWith('688')) marketStocks.STAR.add(code);
  else if (code.startsWith('6')) marketStocks.SH.add(code);
  else if (code.startsWith('0')) marketStocks.SZ.add(code);
  else if (code.startsWith('3')) marketStocks.GEM.add(code);
}
console.log(`SH: ${marketStocks.SH.size}, SZ: ${marketStocks.SZ.size}, GEM: ${marketStocks.GEM.size}, STAR: ${marketStocks.STAR.size}`);

for (const [market, stockSet] of Object.entries(marketStocks)) {
  // 检查已有缓存
  const [cachedRows] = await conn.execute(
    `SELECT DISTINCT trade_date FROM ts_trend_cache WHERE market = ?`, [market]
  );
  const cachedSet = new Set(cachedRows.map(r => r.trade_date));
  const missingDays = allDays.filter(d => !cachedSet.has(d));
  console.log(`\n[${market}] 需补充 ${missingDays.length} 天（已有 ${cachedSet.size} 天）`);
  if (missingDays.length === 0) continue;

  const BATCH_SIZE = 10;
  let processed = 0;
  for (let i = 0; i < missingDays.length; i += BATCH_SIZE) {
    const batch = missingDays.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const [dayRows] = await conn.execute(
      `SELECT ts_code, trade_date, close FROM ts_daily WHERE trade_date IN (${placeholders})`,
      batch
    );

    // 按日期分组
    const byDate = {};
    for (const r of dayRows) {
      if (!stockSet.has(r.ts_code)) continue;
      const fo = firstOpenMap[r.ts_code];
      if (!fo || fo <= 0) continue;
      const close = parseFloat(r.close);
      if (!isFinite(close) || close <= 0) continue;
      if (!byDate[r.trade_date]) byDate[r.trade_date] = { above: 0, below: 0, equal: 0 };
      const diff = (close - fo) / fo;
      if (diff > 0.001) byDate[r.trade_date].above++;
      else if (diff < -0.001) byDate[r.trade_date].below++;
      else byDate[r.trade_date].equal++;
    }

    for (const [td, stat] of Object.entries(byDate)) {
      await conn.execute(
        `INSERT INTO ts_trend_cache (trade_date, market, above, below, equal_cnt) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE above=VALUES(above), below=VALUES(below), equal_cnt=VALUES(equal_cnt)`,
        [td, market, stat.above, stat.below, stat.equal]
      );
    }

    processed += batch.length;
    if (processed % 100 === 0 || processed === missingDays.length) {
      console.log(`  [${market}] 进度: ${processed}/${missingDays.length}`);
    }
  }
  console.log(`[${market}] 缓存构建完成`);
}

await conn.end();
console.log('\n全部板块缓存构建完成！');
