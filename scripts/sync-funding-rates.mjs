/**
 * sync-funding-rates.mjs
 * 从币安 USDS-M 永续合约 API 抓取 BTC/ETH/SOL 历史资金费率并写入数据库
 * 支持全量（首次）和增量（每日）模式
 */
import mysql from 'mysql2/promise';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 读取 .env 文件（生产服务器上有）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const DB_URL = process.env.TENCENT_CLOUD_DB_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.error('No DB URL found'); process.exit(1); }

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const BINANCE_BASE = 'https://fapi.binance.com';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getDbConn() {
  return mysql.createConnection(DB_URL + '?ssl={"rejectUnauthorized":false}');
}

async function ensureTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`crypto_funding_rates\` (
      \`id\`           INT AUTO_INCREMENT PRIMARY KEY,
      \`symbol\`       VARCHAR(20) NOT NULL,
      \`funding_time\` BIGINT NOT NULL,
      \`funding_rate\` DECIMAL(16,8) NOT NULL,
      \`mark_price\`   DECIMAL(20,4),
      \`created_at\`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY \`uk_symbol_time\` (\`symbol\`, \`funding_time\`),
      INDEX \`idx_symbol\` (\`symbol\`),
      INDEX \`idx_funding_time\` (\`funding_time\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getLatestTime(conn, symbol) {
  const [[row]] = await conn.execute(
    'SELECT MAX(funding_time) as latest FROM crypto_funding_rates WHERE symbol = ?',
    [symbol]
  );
  return row?.latest ? Number(row.latest) : 0;
}

async function fetchPage(symbol, startTime, endTime) {
  const params = new URLSearchParams({ symbol, limit: '1000' });
  if (startTime) params.set('startTime', String(startTime));
  if (endTime) params.set('endTime', String(endTime));
  const url = `${BINANCE_BASE}/fapi/v1/fundingRate?${params}`;
  return httpsGet(url);
}

async function upsertBatch(conn, records) {
  if (!records.length) return 0;
  const values = records.map(r => [r.symbol, r.fundingTime, r.fundingRate, r.markPrice]);
  const placeholders = values.map(() => '(?,?,?,?)').join(',');
  const flat = values.flat();
  const [result] = await conn.execute(
    `INSERT INTO crypto_funding_rates (symbol, funding_time, funding_rate, mark_price)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE funding_rate=VALUES(funding_rate), mark_price=VALUES(mark_price)`,
    flat
  );
  return result.affectedRows ?? 0;
}

// 各币种最早有资金费率的时间（毫秒）
const EARLIEST = {
  BTCUSDT: new Date('2019-09-10T00:00:00Z').getTime(),
  ETHUSDT: new Date('2019-11-01T00:00:00Z').getTime(),
  SOLUSDT: new Date('2021-09-17T00:00:00Z').getTime(),
};

async function syncSymbol(conn, symbol) {
  const latestTime = await getLatestTime(conn, symbol);
  // 增量：从最新记录+1ms开始；全量：从最早时间开始
  let startTime = latestTime > 0 ? latestTime + 1 : EARLIEST[symbol];
  const now = Date.now();
  let totalInserted = 0;
  let page = 0;

  console.log(`[${symbol}] 开始同步，起始时间: ${new Date(startTime).toISOString()}`);

  while (startTime < now) {
    const data = await fetchPage(symbol, startTime, null);
    if (!Array.isArray(data) || data.length === 0) break;

    const records = data.map(item => ({
      symbol,
      fundingTime: Number(item.fundingTime),
      fundingRate: Number(item.fundingRate),
      markPrice: item.markPrice != null ? Number(item.markPrice) : null,
    }));

    const inserted = await upsertBatch(conn, records);
    totalInserted += inserted;
    page++;

    const lastTime = records[records.length - 1].fundingTime;
    console.log(`  第${page}页: ${records.length}条, 最新: ${new Date(lastTime).toISOString()}, 累计写入: ${totalInserted}`);

    if (records.length < 1000) break; // 已到最新
    startTime = lastTime + 1;

    // 避免请求过快
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[${symbol}] 同步完成，共写入 ${totalInserted} 条`);
  return totalInserted;
}

async function main() {
  const conn = await getDbConn();
  try {
    await ensureTable(conn);
    for (const symbol of SYMBOLS) {
      await syncSymbol(conn, symbol);
    }
    console.log('全部同步完成');
  } finally {
    await conn.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
