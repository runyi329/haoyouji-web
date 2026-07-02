import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env' });

const conn = await createConnection(process.env.DATABASE_URL);

async function safeAddColumn(table, col, def) {
  const [rows] = await conn.execute(`SHOW COLUMNS FROM \`${table}\` LIKE '${col}'`);
  if (rows.length === 0) {
    await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
    console.log(`✅ Added ${table}.${col}`);
  } else {
    console.log(`⏭  ${table}.${col} already exists`);
  }
}

// 预约表补字段
await safeAddColumn('yaban_appointment', 'consultant', "VARCHAR(64) DEFAULT NULL COMMENT '咨询师'");
await safeAddColumn('yaban_appointment', 'assistant',  "VARCHAR(64) DEFAULT NULL COMMENT '助理'");
await safeAddColumn('yaban_appointment', 'department', "VARCHAR(64) DEFAULT NULL COMMENT '科室'");
await safeAddColumn('yaban_appointment', 'source',     "VARCHAR(64) DEFAULT NULL COMMENT '预约来源'");
await safeAddColumn('yaban_appointment', 'visit_type', "VARCHAR(16) DEFAULT '复诊' COMMENT '就诊类型:初诊/复诊'");

// 确认最终字段
const [cols] = await conn.execute('DESCRIBE yaban_appointment');
console.log('\n最终字段:', cols.map(r => r.Field).join(', '));

await conn.end();
console.log('\nDONE');
