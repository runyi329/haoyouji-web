/**
 * 插入10笔模拟ETH持仓记录到 eth_position_records 表
 * 使用方式：cd haoyouji-repo && node scripts/seed-eth-positions.mjs
 * 
 * 需要 ORIGINAL_DATABASE_URL 或 DATABASE_URL 环境变量
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

// 与 server/db.ts 一致的数据库连接逻辑
const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('缺少 ORIGINAL_DATABASE_URL 或 DATABASE_URL 环境变量');
  process.exit(1);
}

async function main() {
  const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  const conn = await mysql.createConnection({
    uri: dbUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
  });
  console.log('数据库连接成功:', dbUrl.replace(/\/\/.*:.*@/, '//***:***@'));
  
  // 确保表存在
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS eth_position_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledger_id INT NOT NULL,
      user_id INT NOT NULL,
      bet_id INT NOT NULL COMMENT '关联crypto_bets.id',
      bet_order_no VARCHAR(20) DEFAULT '' COMMENT '订单编号',
      loss_amount DECIMAL(20,8) NOT NULL COMMENT '亏损金额(U)',
      eth_price DECIMAL(20,4) NOT NULL COMMENT '买入时ETH价格(U)',
      eth_qty DECIMAL(20,8) NOT NULL COMMENT '买入ETH数量',
      target_date VARCHAR(10) NOT NULL COMMENT '结算日期',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_epr_user (user_id),
      INDEX idx_epr_ledger (ledger_id),
      INDEX idx_epr_bet (bet_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ETH竞猜亏损自动买入ETH持仓记录'
  `);
  console.log('表 eth_position_records 已就绪');

  // 先查一下当前用户（hyy329）的 user_id
  const [userRows] = await conn.execute(
    `SELECT id, username, name FROM users WHERE username = 'hyy329' LIMIT 1`
  );
  const user = (userRows)[0];
  if (!user) {
    console.error('未找到用户 hyy329');
    await conn.end();
    process.exit(1);
  }
  const USER_ID = user.id;
  console.log(`找到用户: id=${USER_ID}, username=${user.username}, name=${user.name}`);

  // 查找 ledger_id=52 是否存在
  const LEDGER_ID = 52;

  // 模拟数据：10笔亏损买入记录，不同日期和价格
  const records = [
    { betId: 90001, orderNo: 'SIM001', lossAmount: 100,  ethPrice: 1620.50, date: '2025-04-01' },
    { betId: 90002, orderNo: 'SIM002', lossAmount: 50,   ethPrice: 1635.20, date: '2025-04-02' },
    { betId: 90003, orderNo: 'SIM003', lossAmount: 200,  ethPrice: 1580.00, date: '2025-04-03' },
    { betId: 90004, orderNo: 'SIM004', lossAmount: 80,   ethPrice: 1610.75, date: '2025-04-05' },
    { betId: 90005, orderNo: 'SIM005', lossAmount: 150,  ethPrice: 1645.30, date: '2025-04-07' },
    { betId: 90006, orderNo: 'SIM006', lossAmount: 30,   ethPrice: 1590.00, date: '2025-04-08' },
    { betId: 90007, orderNo: 'SIM007', lossAmount: 120,  ethPrice: 1625.80, date: '2025-04-09' },
    { betId: 90008, orderNo: 'SIM008', lossAmount: 60,   ethPrice: 1655.40, date: '2025-04-10' },
    { betId: 90009, orderNo: 'SIM009', lossAmount: 250,  ethPrice: 1600.00, date: '2025-04-12' },
    { betId: 90010, orderNo: 'SIM010', lossAmount: 40,   ethPrice: 1670.25, date: '2025-04-14' },
  ];

  let inserted = 0;
  for (const r of records) {
    const ethQty = r.lossAmount / r.ethPrice;
    try {
      await conn.execute(
        `INSERT INTO eth_position_records (ledger_id, user_id, bet_id, bet_order_no, loss_amount, eth_price, eth_qty, target_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [LEDGER_ID, USER_ID, r.betId, r.orderNo, r.lossAmount, r.ethPrice, ethQty, r.date]
      );
      inserted++;
      console.log(`✓ ${r.orderNo}: 亏损${r.lossAmount}U → 买入${ethQty.toFixed(8)} ETH @${r.ethPrice}`);
    } catch (e) {
      console.error(`✗ ${r.orderNo} 失败:`, e.message);
    }
  }

  const totalLoss = records.reduce((s, r) => s + r.lossAmount, 0);
  const totalEth = records.reduce((s, r) => s + r.lossAmount / r.ethPrice, 0);
  console.log(`\n完成：共插入 ${inserted} 笔模拟持仓记录`);
  console.log(`累计亏损买入金额: ${totalLoss} U`);
  console.log(`累计买入ETH数量: ${totalEth.toFixed(8)} ETH`);
  console.log(`平均买入价: ${(totalLoss / totalEth).toFixed(2)} U`);

  await conn.end();
}

main().catch(console.error);
