import mysql from 'mysql2/promise';

const DB_URL = "mysql://root:Miao@20190603@124.223.54.69:3306/crm_db";

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  // 查找37号账本所有分类
  const [cats] = await conn.execute('SELECT id, name, type FROM ledger_categories WHERE ledgerId = 37 ORDER BY id');
  console.log('=== 37号账本分类列表 ===');
  cats.forEach(c => console.log(`  id=${c.id} name=${c.name} type=${c.type}`));
  
  // 查找山郎相关分类
  const [sanwolf] = await conn.execute("SELECT id, name FROM ledger_categories WHERE ledgerId = 37 AND name LIKE '%山郎%'");
  console.log('\n=== 山郎相关分类 ===');
  console.log(sanwolf);
  
  // 查找所有成员的initial_balances（这里存着分配比例）
  const [members] = await conn.execute('SELECT id, userId, role, nickname, initial_balances FROM ledger_members WHERE ledgerId = 37 ORDER BY id');
  console.log('\n=== 37号账本成员 initial_balances ===');
  members.forEach(m => {
    console.log(`\n  userId=${m.userId} nickname=${m.nickname} role=${m.role}`);
    if (m.initial_balances) {
      try {
        const parsed = JSON.parse(m.initial_balances);
        // 只显示含有山郎/三狼的key
        const relevant = Object.entries(parsed).filter(([k]) => k.includes('山郎') || k.includes('三狼') || k.includes('sanwolf'));
        if (relevant.length > 0) {
          console.log('  山郎/三狼相关字段:', relevant);
        } else {
          console.log('  所有字段keys:', Object.keys(parsed));
        }
      } catch(e) {
        console.log('  raw:', m.initial_balances);
      }
    } else {
      console.log('  initial_balances: null');
    }
  });
  
  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
