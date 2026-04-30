/**
 * A股2026年交易成本每日增量更新脚本
 * 每个交易日收盘后（下午4点）由服务器 cron 自动执行
 * 通过 Tushare API 获取当日全市场成交额，累加到 trading_cost_2026 表
 *
 * 用法：node scripts/update-trading-cost-2026.mjs
 */
import mysql from 'mysql2/promise';
import https from 'https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_URL = process.env.DATABASE_URL;
const TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79';

if (!DB_URL) { console.error('❌ DATABASE_URL 未设置'); process.exit(1); }

function parseDbUrl(url) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!m) throw new Error('无法解析 DATABASE_URL');
  return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]), database: m[5].split('?')[0] };
}

/**
 * 通过 Tushare HTTP API 获取指定日期的全市场成交额（亿元）
 * 使用 index_daily 接口获取上证指数当日成交额作为基准，
 * 再通过 daily_info 接口获取全市场成交额
 */
async function fetchDailyAmount(tradeDate) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      api_name: 'daily_info',
      token: TUSHARE_TOKEN,
      params: {
        trade_date: tradeDate,
        exchange: 'SSE',
        fields: 'trade_date,ts_code,ts_name,com_count,total_share,float_share,amount,vol,trans_count,pe,tr,total_mv,float_mv'
      }
    });

    const options = {
      hostname: 'api.tushare.pro',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code !== 0) {
            console.log(`⚠️ Tushare daily_info 返回错误: ${json.msg}`);
            resolve(null);
            return;
          }
          const fields = json.data?.fields || [];
          const items = json.data?.items || [];
          const amountIdx = fields.indexOf('amount');
          // 汇总所有交易所的成交额（单位：万元）
          let totalAmountWan = 0;
          for (const item of items) {
            if (amountIdx >= 0 && item[amountIdx]) {
              totalAmountWan += parseFloat(item[amountIdx]) || 0;
            }
          }
          // 转换为亿元
          const totalAmountYi = totalAmountWan / 10000;
          resolve(totalAmountYi > 0 ? totalAmountYi : null);
        } catch (e) {
          console.log(`⚠️ 解析 Tushare 响应失败: ${e.message}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.log(`⚠️ Tushare 请求失败: ${e.message}`);
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

/**
 * 备用方案：通过东方财富获取全市场成交额
 */
async function fetchDailyAmountFromEastMoney(tradeDate) {
  return new Promise((resolve) => {
    // 东方财富沪深两市成交额
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${tradeDate}&end=${tradeDate}&_=${Date.now()}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://finance.eastmoney.com/',
      },
      timeout: 20000,
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const klines = json.data?.klines || [];
          if (klines.length === 0) { resolve(null); return; }
          // 格式: 日期,开,高,低,收,成交量,成交额,...
          const parts = klines[0].split(',');
          const amountYuan = parseFloat(parts[6]) || 0; // 成交额（元）
          const amountYi = amountYuan / 1e8;
          resolve(amountYi > 0 ? amountYi : null);
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function formatTradeDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

async function main() {
  const now = new Date();
  // 北京时间（UTC+8）
  const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = formatTradeDate(bjNow);
  const yesterday = formatTradeDate(new Date(bjNow.getTime() - 24 * 60 * 60 * 1000));

  console.log(`[${new Date().toISOString()}] A股2026年交易成本每日更新`);
  console.log(`北京时间: ${bjNow.toISOString().replace('T', ' ').slice(0, 19)}`);

  // 判断今天是否是交易日（简单判断：非周末）
  if (isWeekend(bjNow)) {
    console.log('今天是周末，跳过更新');
    return;
  }

  const conn = await mysql.createConnection({
    ...parseDbUrl(DB_URL),
    ssl: { rejectUnauthorized: false },
    connectTimeout: 15000,
  });

  try {
    // 检查 trading_cost_2026 表是否存在，不存在则创建
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS trading_cost_2026 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        last_trade_date VARCHAR(8) NOT NULL COMMENT '最后更新的交易日期 YYYYMMDD',
        trading_days INT NOT NULL DEFAULT 0 COMMENT '已过交易日数',
        total_amount_yi DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '累计成交额（亿元）',
        stamp_tax_yi DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计印花税（亿元）',
        broker_fee_yi DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计券商佣金（亿元）',
        handling_fee_yi DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计经手费（亿元）',
        transfer_fee_yi DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计过户费（亿元）',
        regulation_fee_yi DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计监管费（亿元）',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_last_trade_date (last_trade_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 获取当前累计数据
    const [rows] = await conn.execute('SELECT * FROM trading_cost_2026 ORDER BY id DESC LIMIT 1');
    const current = rows[0];

    if (!current) {
      console.log('⚠️ 表为空，请先初始化数据');
      return;
    }

    // 检查今天是否已经更新过
    if (current.last_trade_date >= today) {
      console.log(`✅ 今天（${today}）已更新，当前截至 ${current.last_trade_date}，跳过`);
      return;
    }

    // 尝试获取昨天（或最近交易日）的成交额
    // 先尝试今天，再尝试昨天
    let targetDate = today;
    let amountYi = null;

    // 先尝试 Tushare
    console.log(`📊 尝试获取 ${targetDate} 的成交额（Tushare）...`);
    amountYi = await fetchDailyAmount(targetDate);

    if (!amountYi) {
      console.log(`⚠️ Tushare 未返回 ${targetDate} 数据，尝试东方财富...`);
      amountYi = await fetchDailyAmountFromEastMoney(targetDate);
    }

    if (!amountYi) {
      // 尝试昨天
      targetDate = yesterday;
      console.log(`⚠️ 今日数据未就绪，尝试获取 ${targetDate}...`);
      amountYi = await fetchDailyAmount(targetDate);
      if (!amountYi) {
        amountYi = await fetchDailyAmountFromEastMoney(targetDate);
      }
    }

    if (!amountYi) {
      console.log('❌ 无法获取成交额数据，今日跳过');
      return;
    }

    // 计算各项税费（按2026年现行费率）
    // 印花税：单边 0.5‰ = 成交额 × 0.05%（买卖各一边，只收卖方）
    const stampTaxYi = amountYi * 0.0005;
    // 券商佣金：双边约 0.6‰（买卖各0.3‰）
    const brokerFeeYi = amountYi * 0.0006;
    // 经手费：双边 0.0341‰
    const handlingFeeYi = amountYi * 0.0000341 * 2;
    // 过户费：双边 0.02‰
    const transferFeeYi = amountYi * 0.00002 * 2;
    // 监管费：双边 0.002‰
    const regulationFeeYi = amountYi * 0.000002 * 2;

    // 累加到现有数据
    const newData = {
      last_trade_date: targetDate,
      trading_days: current.trading_days + 1,
      total_amount_yi: parseFloat(current.total_amount_yi) + amountYi,
      stamp_tax_yi: parseFloat(current.stamp_tax_yi) + stampTaxYi,
      broker_fee_yi: parseFloat(current.broker_fee_yi) + brokerFeeYi,
      handling_fee_yi: parseFloat(current.handling_fee_yi) + handlingFeeYi,
      transfer_fee_yi: parseFloat(current.transfer_fee_yi) + transferFeeYi,
      regulation_fee_yi: parseFloat(current.regulation_fee_yi) + regulationFeeYi,
    };

    await conn.execute(
      `UPDATE trading_cost_2026 SET 
        last_trade_date=?, trading_days=?, total_amount_yi=?, stamp_tax_yi=?,
        broker_fee_yi=?, handling_fee_yi=?, transfer_fee_yi=?, regulation_fee_yi=?
       WHERE id=?`,
      [
        newData.last_trade_date,
        newData.trading_days,
        newData.total_amount_yi.toFixed(2),
        newData.stamp_tax_yi.toFixed(2),
        newData.broker_fee_yi.toFixed(2),
        newData.handling_fee_yi.toFixed(2),
        newData.transfer_fee_yi.toFixed(2),
        newData.regulation_fee_yi.toFixed(2),
        current.id,
      ]
    );

    console.log(`✅ 更新成功！`);
    console.log(`   交易日期: ${targetDate}`);
    console.log(`   当日成交额: ${amountYi.toFixed(0)} 亿元`);
    console.log(`   2026年累计成交额: ${(newData.total_amount_yi / 10000).toFixed(2)} 万亿`);
    console.log(`   2026年累计印花税: ${newData.stamp_tax_yi.toFixed(0)} 亿元`);
    console.log(`   2026年累计券商佣金: ${newData.broker_fee_yi.toFixed(0)} 亿元`);
    console.log(`   已过交易日: ${newData.trading_days} 天`);

  } finally {
    await conn.end();
  }
}

main().catch(e => {
  console.error('❌ 更新失败:', e.message);
  process.exit(1);
});
