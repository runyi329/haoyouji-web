import mysql from 'mysql2/promise';

// 使用 crm_db（EXTERNAL_DATABASE_URL）
const connection = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
  ssl: false
});

// 分类名称 → 透明背景CDN图标URL
const iconMap = {
  '食品饮料': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/MKosvFzNQTFAWVtZ.png',
  '美妆护肤': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/UIzvrmWYmJPvAhNS.png',
  '服装鞋帽': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/SgxMsxEIXyEyQBNN.png',
  '日用百货': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/nyZvnXucJYERXSHL.png',
  '水果生鲜': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/qrQtCxWjDFwrYeSi.png',
  '家用电器': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/wamOkiAcrzBcYsPh.png',
  '家具家纺': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/aeGMDyfXovkWMWUt.png',
  '母婴用品': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/uBLIzGrRmqaPvxqI.png',
  '运动户外': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/sAKrMWkdlieUiKbJ.png',
  '宠物生活': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/TPgdfHUCzwclrMJl.png',
  '数码通讯': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/dWOFqAeBLVQifRuR.png',
  '礼品玩具': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/rQOiLebbFtBZvxSr.png',
  '健康养生': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/LohqIniGXAthqGmS.png',
  '珠宝首饰': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/fRjfgGJiJICIeApd.png',
  '更多': 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/MRBJAPPDfDpbTplX.png',
};

console.log('开始更新分类图标URL...');

for (const [name, iconUrl] of Object.entries(iconMap)) {
  const [result] = await connection.execute(
    'UPDATE merchant_product_categories SET iconUrl = ? WHERE name = ?',
    [iconUrl, name]
  );
  const affected = result.affectedRows;
  if (affected > 0) {
    console.log(`✅ ${name}`);
  } else {
    console.log(`⚠️  未找到分类: ${name}`);
  }
}

// 查看更新结果
const [rows] = await connection.execute(
  'SELECT id, name, iconUrl FROM merchant_product_categories ORDER BY sortOrder ASC LIMIT 20'
);
console.log('\n当前分类列表:');
rows.forEach(r => console.log(`  [${r.id}] ${r.name}: ${r.iconUrl ? '✅有图标' : '❌无图标'}`));

await connection.end();
console.log('\n完成！');
