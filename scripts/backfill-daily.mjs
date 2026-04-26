/**
 * backfill-daily.mjs
 * 补拉 ts_daily 缺失的交易日数据
 * 用法: node scripts/backfill-daily.mjs
 */
import mysql from 'mysql2/promise';

const TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79';
const TUSHARE_URL = 'http://api.tushare.pro';
const DB_URL = process.env.ORIGINAL_DATABASE_URL ?? 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';

// A股2026年4月11日至4月25日的实际交易日（排除周末：4/12周日、4/13周日不对，重新算）
// 4月11日周五 ✓
// 4月12日周六 ✗
// 4月13日周日 ✗
// 4月14日周一 ✓
// 4月15日周二 ✓
// 4月16日周三 ✓
// 4月17日周四 ✓
// 4月18日周五 ✓
// 4月19日周六 ✗
// 4月20日周日 ✗
// 4月21日周一 ✓
// 4月22日周二 ✓
// 4月23日周三 ✓
// 4月24日周四 ✓
// 4月25日周五 ✓
// 4月26日周六 ✗（今天，且未收盘）
// 注：清明节假期已在4月4日，这段时间无法定节假日

const TRADE_DATES = [
  '20260411',
  '20260414',
  '20260415',
  '20260416',
  '20260417',
  '20260418',
  '20260421',
  '20260422',
  '20260423',
  '20260424',
  '20260425',
];

async function fetchDailyData(tradeDate) {
  console.log(`[补拉] 正在从 Tushare 拉取 ${tradeDate} 数据...`);
  const PAGE_SIZE = 8000;
  let allItems = [];
  let fields = [];
  let offset = 0;

  while (true) {
    const resp = await fetch(TUSHARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: 'daily',
        token: TUSHARE_TOKEN,
        params: { trade_date: tradeDate, limit: PAGE_SIZE, offset },
        fields: 'ts_code,trade_date,open,high,low,close,pre_close,chg,pct_chg,vol,amount',
      }),
      signal: AbortSignal.timeout(30000),
    });

    const json = await resp.json();
    if (json.code !== 0) {
      console.error(`  [错误] Tushare API 返回错误: ${json.msg}`);
      return null;
    }

    const { items, fields: f } = json.data;
    if (fields.length === 0 && f) fields = f;
    if (!items || items.length === 0) break;
    allItems = allItems.concat(items);
    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { items: allItems, fields };
}

async function writeToDb(conn, tradeDate, items, fields) {
  if (!items || items.length === 0) {
    console.log(`  [跳过] ${tradeDate} 无数据（可能是非交易日）`);
    return 0;
  }

  const fi = (name) => fields.indexOf(name);
  const tsCodeIdx = fi('ts_code');
  const tradeDateIdx = fi('trade_date');
  const openIdx = fi('open');
  const highIdx = fi('high');
  const lowIdx = fi('low');
  const closeIdx = fi('close');
  const preCloseIdx = fi('pre_close');
  const chgIdx = fi('chg');
  const pctChgIdx = fi('pct_chg');
  const volIdx = fi('vol');
  const amountIdx = fi('amount');

  // 查询已有数据
  const [existRows] = await conn.execute(
    'SELECT ts_code FROM ts_daily WHERE trade_date = ?', [tradeDate]
  );
  const existSet = new Set(existRows.map(r => r.ts_code));
  const newItems = items.filter(row => !existSet.has(String(row[tsCodeIdx])));

  console.log(`  已有 ${existSet.size} 条，新增 ${newItems.length} 条`);
  if (newItems.length === 0) {
    console.log(`  ${tradeDate} 数据已是最新，无需写入`);
    return 0;
  }

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < newItems.length; i += BATCH) {
    const batch = newItems.slice(i, i + BATCH);
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,NOW())').join(',');
    const values = [];
    for (const row of batch) {
      values.push(
        String(row[tsCodeIdx]),
        String(row[tradeDateIdx]),
        row[openIdx] != null ? Number(row[openIdx]) : null,
        row[highIdx] != null ? Number(row[highIdx]) : null,
        row[lowIdx] != null ? Number(row[lowIdx]) : null,
        row[closeIdx] != null ? Number(row[closeIdx]) : null,
        row[preCloseIdx] != null ? Number(row[preCloseIdx]) : null,
        row[chgIdx] != null ? Number(row[chgIdx]) : null,
        row[pctChgIdx] != null ? Number(row[pctChgIdx]) : null,
        row[volIdx] != null ? Number(row[volIdx]) : null,
        row[amountIdx] != null ? Number(row[amountIdx]) : null,
      );
    }
    await conn.execute(
      `INSERT INTO ts_daily (ts_code, trade_date, open, high, low, close, pre_close, chg, pct_chg, vol, amount, updated_at) VALUES ${placeholders}`,
      values
    );
    inserted += batch.length;
  }

  console.log(`  ✅ ${tradeDate} 写入完成，共插入 ${inserted} 条`);
  return inserted;
}

async function main() {
  console.log('=== 开始补拉缺失交易日数据 ===');
  console.log(`待补拉日期: ${TRADE_DATES.join(', ')}`);

  const conn = await mysql.createConnection(DB_URL);
  console.log('数据库连接成功');

  let totalInserted = 0;
  for (const tradeDate of TRADE_DATES) {
    try {
      const result = await fetchDailyData(tradeDate);
      if (result) {
        const n = await writeToDb(conn, tradeDate, result.items, result.fields);
        totalInserted += n;
      }
      // 控制 API 频率
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`  [错误] ${tradeDate} 处理失败:`, err.message);
    }
  }

  // 验证最终状态
  const [maxDate] = await conn.execute('SELECT MAX(trade_date) as max_date FROM ts_daily');
  console.log(`\n=== 补拉完成 ===`);
  console.log(`总计插入: ${totalInserted} 条`);
  console.log(`ts_daily 最新交易日: ${maxDate[0].max_date}`);

  await conn.end();
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
