import * as mysql from 'mysql2/promise';

const DB_URL = 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';
const conn = await mysql.createConnection(DB_URL);
try {
  await conn.execute('ALTER TABLE eth_position_settings ADD COLUMN strategy_ratio INT NOT NULL DEFAULT 50');
  console.log('✅ strategy_ratio 列添加成功（默认50，即策略持仓50%，战略持仓50%）');
} catch (e: any) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('✅ strategy_ratio 列已存在');
  } else {
    console.error('❌ 失败:', e.message);
  }
}
// 验证列存在
const [rows]: any = await conn.execute("SHOW COLUMNS FROM eth_position_settings LIKE 'strategy_ratio'");
console.log('列信息:', JSON.stringify(rows));
await conn.end();
