import mysql from 'mysql2/promise';

let conn;
try {
  conn = await mysql.createConnection({
    host: '124.223.54.69',
    port: 3306,
    user: 'root',
    password: 'Miao@20190603',
    database: 'crm_db',
    connectTimeout: 20000,
    ssl: { rejectUnauthorized: false },
  });
} catch(e) {
  // 如果SSL失败，尝试不用SSL
  conn = await mysql.createConnection({
    host: '124.223.54.69',
    port: 3306,
    user: 'root',
    password: 'Miao@20190603',
    database: 'crm_db',
    connectTimeout: 20000,
  });
}

console.log('✅ 数据库连接成功\n');

// 1. 备份设置总览
const [backupSettings] = await conn.execute(`
  SELECT 
    lbs.id,
    lbs.ledger_id,
    l.name AS ledger_name,
    l.type AS ledger_type,
    u.name AS user_name,
    u.username,
    u.email,
    lbs.frequency,
    lbs.enabled,
    lbs.backup_count,
    lbs.last_backup_at,
    lbs.next_backup_at,
    lbs.created_at
  FROM ledger_backup_settings lbs
  LEFT JOIN ledgers l ON l.id = lbs.ledger_id
  LEFT JOIN users u ON u.id = lbs.user_id
  ORDER BY lbs.last_backup_at DESC
`);

console.log('═══════════════════════════════════════════════════');
console.log('📋 账本备份设置总览');
console.log('═══════════════════════════════════════════════════');
console.log(`共 ${backupSettings.length} 条备份设置\n`);

for (const row of backupSettings) {
  console.log(`账本：${row.ledger_name || '(未知)'} (ID: ${row.ledger_id})`);
  console.log(`  类型：${row.ledger_type || '-'}`);
  console.log(`  用户：${row.user_name || row.username || '-'}  邮箱：${row.email || '未设置'}`);
  console.log(`  频率：${row.frequency}  启用：${row.enabled ? '✅ 是' : '❌ 否'}`);
  console.log(`  已备份次数：${row.backup_count}`);
  console.log(`  上次备份：${row.last_backup_at ? new Date(row.last_backup_at).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) : '从未执行'}`);
  console.log(`  下次备份：${row.next_backup_at ? new Date(row.next_backup_at).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) : '-'}`);
  console.log(`  创建时间：${row.created_at ? new Date(row.created_at).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) : '-'}`);
  console.log('');
}

// 2. 数据库整体规模概览
console.log('═══════════════════════════════════════════════════');
console.log('📊 数据库整体规模概览');
console.log('═══════════════════════════════════════════════════');

const tables = [
  { name: 'users', label: '用户' },
  { name: 'ledgers', label: '账本' },
  { name: 'transactions', label: '账目记录' },
  { name: 'ledger_members', label: '账本成员' },
  { name: 'contacts', label: '联系人' },
  { name: 'beauty_clients', label: '美容客户' },
  { name: 'beauty_member_cards', label: '消费卡' },
  { name: 'beauty_visit_logs', label: '消费记录' },
  { name: 'beauty_points_logs', label: '积分记录' },
  { name: 'coupons', label: '优惠券' },
  { name: 'ledger_backup_settings', label: '备份设置' },
];

for (const t of tables) {
  try {
    const [[row]] = await conn.execute(`SELECT COUNT(*) AS cnt FROM \`${t.name}\``);
    console.log(`  ${t.label.padEnd(10)} (${t.name})：${row.cnt} 条`);
  } catch (e) {
    console.log(`  ${t.label.padEnd(10)} (${t.name})：表不存在`);
  }
}

// 3. 最近7天账目活动
console.log('\n═══════════════════════════════════════════════════');
console.log('📅 最近 7 天账目活动');
console.log('═══════════════════════════════════════════════════');
try {
  const [recentTx] = await conn.execute(`
    SELECT DATE(created_at) AS day, COUNT(*) AS cnt
    FROM transactions
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  `);
  if (recentTx.length === 0) {
    console.log('  最近 7 天无账目记录');
  } else {
    for (const r of recentTx) {
      console.log(`  ${r.day}：${r.cnt} 条`);
    }
  }
} catch (e) {
  console.log('  查询失败：', e.message);
}

// 4. 最近注册用户
console.log('\n═══════════════════════════════════════════════════');
console.log('👥 最近 5 位注册用户');
console.log('═══════════════════════════════════════════════════');
try {
  const [recentUsers] = await conn.execute(`
    SELECT id, username, name, role, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT 5
  `);
  for (const u of recentUsers) {
    console.log(`  ${u.name || u.username} (@${u.username})  角色：${u.role}  注册：${new Date(u.created_at).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}`);
  }
} catch (e) {
  console.log('  查询失败：', e.message);
}

// 5. 最近美容消费记录
console.log('\n═══════════════════════════════════════════════════');
console.log('💆 最近 5 条美容消费记录');
console.log('═══════════════════════════════════════════════════');
try {
  const [recentVisits] = await conn.execute(`
    SELECT bvl.id, bc.name AS client_name, bvl.visit_date, bvl.notes, bvl.created_at
    FROM beauty_visit_logs bvl
    LEFT JOIN beauty_clients bc ON bc.id = bvl.client_id
    ORDER BY bvl.created_at DESC
    LIMIT 5
  `);
  for (const v of recentVisits) {
    console.log(`  ${v.client_name || '-'}  消费日期：${v.visit_date || '-'}  备注：${v.notes || '-'}  录入：${new Date(v.created_at).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}`);
  }
} catch (e) {
  console.log('  查询失败：', e.message);
}

await conn.end();
console.log('\n✅ 查询完成');
