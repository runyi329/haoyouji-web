import * as mysql from 'mysql2/promise';

const url = 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';
console.log('连接腾讯云数据库...');
const conn = await mysql.createConnection(url);
console.log('连接成功 ✅');

// 1. 检查表是否存在
const [tables] = await conn.execute(`SHOW TABLES LIKE 'eth_position_change_logs'`);
const tableArr = tables as any[];
console.log('\n[1] 表是否存在:', tableArr.length > 0 ? '✅ 存在' : '❌ 不存在');

if (tableArr.length === 0) {
  console.log('→ 表不存在，正在创建...');
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`eth_position_change_logs\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledger_id INT NOT NULL COMMENT '账本ID',
      price INT NOT NULL COMMENT '档位价格',
      change_type ENUM('actual','planned') NOT NULL COMMENT '修改类型',
      old_value DECIMAL(18,8) NOT NULL COMMENT '修改前的值',
      new_value DECIMAL(18,8) NOT NULL COMMENT '修改后的值',
      note VARCHAR(500) NOT NULL DEFAULT '' COMMENT '用户备注',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX eth_log_ledger_idx (ledger_id),
      INDEX eth_log_ledger_price_idx (ledger_id, price)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ETH持仓修改日志表'
  `);
  console.log('→ 表创建成功 ✅');
}

// 2. 查询记录数
const [count] = await conn.execute('SELECT COUNT(*) as total FROM eth_position_change_logs');
console.log('\n[2] 当前记录数:', (count as any[])[0].total, '条');

// 3. 查看最新5条
const [rows] = await conn.execute('SELECT id, ledger_id, price, change_type, old_value, new_value, note, created_at FROM eth_position_change_logs ORDER BY created_at DESC LIMIT 5');
console.log('\n[3] 最新5条记录:', JSON.stringify(rows, null, 2));

// 4. 尝试手动插入一条，验证写入权限
try {
  await conn.execute(
    "INSERT INTO eth_position_change_logs (ledger_id, price, change_type, old_value, new_value, note) VALUES (?, ?, ?, ?, ?, ?)",
    [1, 2000, 'actual', 0.5, 1.0, 'diagnose-test']
  );
  const [r2] = await conn.execute("SELECT COUNT(*) as total FROM eth_position_change_logs WHERE note = 'diagnose-test'");
  console.log('\n[4] 手动写入测试: ✅ 成功，写入', (r2 as any[])[0].total, '条');
  await conn.execute("DELETE FROM eth_position_change_logs WHERE note = 'diagnose-test'");
  console.log('→ 测试数据已清理');
} catch(e: any) {
  console.log('\n[4] 手动写入测试: ❌ 失败 -', e.message);
}

await conn.end();
