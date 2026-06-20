/**
 * 在腾讯云MySQL上创建商家相关表，并插入cx8618商家和三款红酒产品
 * 运行方式：node scripts/create-merchant-tables.mjs
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000,
});

console.log('✅ 连接腾讯云MySQL成功');

// 分开执行每条建表SQL
const tables = [
  {
    name: 'merchants',
    sql: `CREATE TABLE IF NOT EXISTS merchants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL UNIQUE,
  merchantCode VARCHAR(50) NOT NULL UNIQUE,
  shopName VARCHAR(100) NOT NULL,
  shopDescription TEXT,
  shopLogoUrl VARCHAR(500),
  shopCoverUrl VARCHAR(500),
  shopThemeColor VARCHAR(20) DEFAULT '#8B1A1A',
  shopType VARCHAR(50) DEFAULT 'wine',
  contactPhone VARCHAR(20),
  contactWechat VARCHAR(100),
  businessHours VARCHAR(200),
  address TEXT,
  isActive TINYINT DEFAULT 1,
  share_title VARCHAR(50),
  share_logo VARCHAR(500),
  share_cover_image VARCHAR(500),
  share_description VARCHAR(100),
  contact_wechat VARCHAR(50),
  contact_phone VARCHAR(20),
  about_us TEXT,
  official_website VARCHAR(200),
  createdAt DATETIME DEFAULT NOW(),
  updatedAt DATETIME DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'merchant_products',
    sql: `CREATE TABLE IF NOT EXISTS merchant_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ownerMerchantId INT,
  name VARCHAR(200) NOT NULL,
  subtitle VARCHAR(300),
  description TEXT,
  basePrice DECIMAL(10,2),
  originalPrice DECIMAL(10,2),
  mainImageUrl VARCHAR(500),
  imageUrls TEXT,
  stock INT DEFAULT 999,
  status ENUM('active','inactive','draft') DEFAULT 'active',
  sourceType ENUM('platform','merchant') DEFAULT 'merchant',
  isShareable TINYINT DEFAULT 1,
  extendedFields TEXT,
  createdAt DATETIME DEFAULT NOW(),
  updatedAt DATETIME DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'merchant_shop_products',
    sql: `CREATE TABLE IF NOT EXISTS merchant_shop_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchantId INT NOT NULL,
  productId INT NOT NULL,
  isOwned TINYINT DEFAULT 1,
  isVisible TINYINT DEFAULT 1,
  customPrice DECIMAL(10,2),
  customSortOrder INT DEFAULT 0,
  addedAt DATETIME DEFAULT NOW(),
  updatedAt DATETIME DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY msp_unique (merchantId, productId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'wine_regions',
    sql: `CREATE TABLE IF NOT EXISTS wine_regions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchantId INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  country VARCHAR(50),
  description TEXT,
  imageUrl VARCHAR(500),
  sortOrder INT DEFAULT 0,
  isActive TINYINT DEFAULT 1,
  createdAt DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'product_import_requests',
    sql: `CREATE TABLE IF NOT EXISTS product_import_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productId INT NOT NULL,
  merchantCode VARCHAR(50) NOT NULL,
  requestedByUserId INT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  note TEXT,
  createdAt DATETIME DEFAULT NOW(),
  updatedAt DATETIME DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  }
];

// 逐个建表
for (const t of tables) {
  try {
    await conn.execute(t.sql);
    console.log(`✅ 表 ${t.name} 创建成功（或已存在）`);
  } catch (e) {
    console.error(`❌ 表 ${t.name} 创建失败:`, e.message);
  }
}

// 查询cx8618对应的userId
console.log('\n查询cx8618用户...');
const [userRows] = await conn.execute(`SELECT id, username FROM users WHERE username = 'cx8618' LIMIT 1`);
let cx8618UserId;
if (userRows.length > 0) {
  cx8618UserId = userRows[0].id;
  console.log(`✅ 找到cx8618用户，userId = ${cx8618UserId}`);
} else {
  // 如果没有找到，用一个固定ID（后续可以更新）
  console.log('⚠️  未找到cx8618用户，使用占位userId=9999');
  cx8618UserId = 9999;
}

// 插入cx8618商家记录
console.log('\n插入cx8618商家记录...');
try {
  const [existing] = await conn.execute(`SELECT id FROM merchants WHERE merchantCode = 'cx8618' LIMIT 1`);
  if (existing.length > 0) {
    console.log(`⚠️  商家cx8618已存在 (ID: ${existing[0].id})，跳过插入`);
    var merchantId = existing[0].id;
  } else {
    const [result] = await conn.execute(
      `INSERT INTO merchants (userId, merchantCode, shopName, shopDescription, shopThemeColor, shopType, share_description) VALUES (?, 'cx8618', '红酒文化商会', '汇聚全球顶级酒庄资源，传播红酒文化，连接爱酒之人', '#8B1A1A', 'wine', '汇聚全球顶级酒庄资源，传播红酒文化，连接爱酒之人')`,
      [cx8618UserId]
    );
    var merchantId = result.insertId;
    console.log(`✅ 商家cx8618插入成功 (ID: ${merchantId})`);
  }
} catch(e) {
  console.error('❌ 插入商家失败:', e.message);
  process.exit(1);
}

// 插入三款产品
console.log('\n插入三款红酒产品...');
const products = [
  {
    name: 'FIDENCIO RESERVA 飞腾干红葡萄酒',
    subtitle: '圣女酒庄 · 西班牙拉曼恰产区 · 2016年份',
    basePrice: '168.00',
    originalPrice: '238.00',
    description: JSON.stringify({
      winery: '圣女酒庄（Virgen de las Vinas）',
      wineryDesc: '圣女酒庄坐落于西班牙拉曼恰产区，其历史可追溯到1961年，它作为工坊而被建立，1995年始，得益于政府的帮助，开始生产并酿造葡萄酒至今。在其50多年的历史中，巧妙地将传统生产工艺与尖端技术相结合，跻身于葡萄酒行业前列。',
      country: '西班牙', vintage: '2016', region: '拉曼恰',
      alcohol: '13.5%vol', volume: '750ml', grade: 'DO/RESERVA', grape: '丹魄',
      review: '该款葡萄酒采用100%丹魄酿制而成。12个月的橡木桶陈酿，酒体柔顺饱满。',
      pairing: '奶酪、牛排、各种肉类',
    }),
    extendedFields: JSON.stringify({ country: '西班牙', vintage: '2016', region: '拉曼恰', alcohol: '13.5%vol', volume: '750ml', grade: 'DO/RESERVA', grape: '丹魄' }),
  },
  {
    name: 'MARTHU 玛莎干红葡萄酒',
    subtitle: '马约尔酒庄 · 西班牙里奥哈产区 · 2018年份',
    basePrice: '198.00',
    originalPrice: '268.00',
    description: JSON.stringify({
      winery: '马约尔酒庄（Bodegas Fuenmayor）',
      wineryDesc: '该酒庄位于西班牙里奥哈产区，采用传统和先进的酿造工艺相结合。在这里，葡萄酒是自然而然的选择和处理的。',
      country: '西班牙', vintage: '2018', region: '里奥哈',
      alcohol: '14.5%vol', volume: '750ml', grade: 'DOC', grape: '添帕尼优',
      review: '该款酒呈石榴红色，采用西班牙特有的葡萄品种添帕尼优，明亮清新的色泽令人愉快，优雅清爽的果香，单宁适中，酸度均衡，回味悠长。',
      pairing: '奶酪、牛排、各种肉类',
    }),
    extendedFields: JSON.stringify({ country: '西班牙', vintage: '2018', region: '里奥哈', alcohol: '14.5%vol', volume: '750ml', grade: 'DOC', grape: '添帕尼优' }),
  },
  {
    name: 'ROMANICO 罗马尼克干红葡萄酒',
    subtitle: 'Teso La Monja酒庄 · 西班牙托罗产区',
    basePrice: '328.00',
    originalPrice: '468.00',
    description: JSON.stringify({
      winery: 'Teso La Monja',
      wineryDesc: '这是一款来自托罗产区物超所值的葡萄酒。它酒体饱满，酒体丰腴，余味悠长，其口感堪比50美元或更高价位的葡萄酒。——《葡萄酒倡导家》杂志',
      country: '西班牙', vintage: '2020', region: '托罗',
      alcohol: '14.5%vol', volume: '750ml', grade: 'DO', grape: '100%丹魄',
      review: '传统方式酿造，100%去梗。在法国橡木桶中进行苹果酸乳酸发酵后陈酿6个月，瓶中成年2个月。',
      pairing: '红肉、烤羊排、陈年奶酪',
      scores: { rp: 92, st: 91, pena: 92 },
      vineyard: '位于托罗产区萨莫拉的有机葡萄园，平均气温21摄氏度，海拔750-850米。',
      brewing: '传统方式酿造，100%去梗。在法国橡木桶中进行苹果酸乳酸发酵后陈酿6个月，瓶中成年2个月。',
    }),
    extendedFields: JSON.stringify({ country: '西班牙', vintage: '2020', region: '托罗', alcohol: '14.5%vol', volume: '750ml', grade: 'DO', grape: '100%丹魄', rpScore: '92', stScore: '91', penaScore: '92' }),
  },
];

for (const p of products) {
  try {
    const [existing] = await conn.execute(`SELECT id FROM merchant_products WHERE name = ? LIMIT 1`, [p.name]);
    if (existing.length > 0) {
      console.log(`⚠️  商品已存在，跳过: ${p.name}`);
      var productId = existing[0].id;
    } else {
      const [result] = await conn.execute(
        `INSERT INTO merchant_products (ownerMerchantId, name, subtitle, description, basePrice, originalPrice, stock, status, sourceType, isShareable, extendedFields) VALUES (?, ?, ?, ?, ?, ?, 999, 'active', 'merchant', 1, ?)`,
        [merchantId, p.name, p.subtitle, p.description, p.basePrice, p.originalPrice, p.extendedFields]
      );
      var productId = result.insertId;
      console.log(`✅ 商品写入总库: ${p.name} (ID: ${productId})`);
    }
    
    // 写入店铺陈列层
    try {
      await conn.execute(
        `INSERT IGNORE INTO merchant_shop_products (merchantId, productId, isOwned, isVisible, customSortOrder) VALUES (?, ?, 1, 1, 0)`,
        [merchantId, productId]
      );
      console.log(`✅ 商品写入店铺陈列层: ${p.name}`);
    } catch(e2) {
      console.log(`⚠️  店铺陈列层已存在: ${p.name}`);
    }
  } catch(e) {
    console.error(`❌ 插入失败: ${p.name}`, e.message);
  }
}

// 最终验证
console.log('\n--- 最终验证 ---');
for (const t of ['merchants','merchant_products','merchant_shop_products']) {
  const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
  console.log(`${t}: ${rows[0].cnt} 条`);
}

await conn.end();
console.log('\n🎉 完成！所有数据已写入腾讯云MySQL。');
