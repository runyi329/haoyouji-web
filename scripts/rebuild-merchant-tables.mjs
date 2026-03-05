/**
 * 重建商家相关表，与 drizzle/merchant-schema.ts 完全一致
 * 运行方式：node scripts/rebuild-merchant-tables.mjs
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

// 删除旧表（按依赖顺序）
const dropTables = [
  'merchant_shop_products',
  'merchant_product_share_requests',
  'merchant_product_specs',
  'merchant_products',
  'merchant_product_categories',
  'merchants',
  'wine_regions',
  'product_import_requests',
];
for (const t of dropTables) {
  await conn.execute(`DROP TABLE IF EXISTS ${t}`);
  console.log(`🗑️  删除旧表: ${t}`);
}

// 按正确顺序重建表
const createStatements = [
  // 1. merchants
  {
    name: 'merchants',
    sql: `CREATE TABLE merchants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL UNIQUE,
  merchantCode VARCHAR(50) NOT NULL UNIQUE,
  shopName VARCHAR(100) NOT NULL,
  shopDescription TEXT,
  shopLogoUrl TEXT,
  shopBannerUrl TEXT,
  themeColor VARCHAR(20) DEFAULT '#722F37',
  shopType VARCHAR(50),
  contactPhone VARCHAR(20),
  contactWechat VARCHAR(50),
  status ENUM('active','inactive','suspended') DEFAULT 'active' NOT NULL,
  isVerified TINYINT DEFAULT 0 NOT NULL,
  depositAmount DECIMAL(10,2) DEFAULT '0.00',
  share_title VARCHAR(50),
  share_logo TEXT,
  share_cover_image TEXT,
  share_description VARCHAR(100),
  contact_wechat VARCHAR(50),
  contact_phone VARCHAR(20),
  about_us TEXT,
  official_website VARCHAR(200),
  createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL,
  INDEX merchants_userId_idx (userId),
  INDEX merchants_merchantCode_idx (merchantCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  // 2. merchant_product_categories
  {
    name: 'merchant_product_categories',
    sql: `CREATE TABLE merchant_product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchantId INT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  iconUrl TEXT,
  sortOrder INT DEFAULT 0 NOT NULL,
  isActive TINYINT DEFAULT 1 NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL,
  INDEX mpc_merchantId_idx (merchantId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  // 3. merchant_products
  {
    name: 'merchant_products',
    sql: `CREATE TABLE merchant_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ownerMerchantId INT,
  categoryId INT,
  name VARCHAR(200) NOT NULL,
  subtitle VARCHAR(300),
  description TEXT,
  mainImageUrl TEXT,
  imageUrls TEXT,
  videoUrl TEXT,
  basePrice DECIMAL(10,2) NOT NULL,
  originalPrice DECIMAL(10,2),
  unit VARCHAR(20) DEFAULT '件',
  stock INT DEFAULT 999 NOT NULL,
  salesCount INT DEFAULT 0 NOT NULL,
  sourceType ENUM('platform','merchant','shared') DEFAULT 'merchant' NOT NULL,
  status ENUM('active','inactive','draft') DEFAULT 'active' NOT NULL,
  isShareable TINYINT DEFAULT 1 NOT NULL,
  extendedFields TEXT,
  sortOrder INT DEFAULT 0 NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL,
  INDEX mp_ownerMerchantId_idx (ownerMerchantId),
  INDEX mp_categoryId_idx (categoryId),
  INDEX mp_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  // 4. merchant_product_specs
  {
    name: 'merchant_product_specs',
    sql: `CREATE TABLE merchant_product_specs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productId INT NOT NULL,
  specName VARCHAR(50) NOT NULL,
  specValue VARCHAR(100) NOT NULL,
  priceAdjustment DECIMAL(10,2) DEFAULT '0.00',
  stock INT DEFAULT 999 NOT NULL,
  isActive TINYINT DEFAULT 1 NOT NULL,
  sortOrder INT DEFAULT 0 NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
  INDEX mps_productId_idx (productId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  // 5. merchant_shop_products
  {
    name: 'merchant_shop_products',
    sql: `CREATE TABLE merchant_shop_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchantId INT NOT NULL,
  productId INT NOT NULL,
  displayPrice DECIMAL(10,2),
  customCategoryId INT,
  customSortOrder INT DEFAULT 0 NOT NULL,
  isVisible TINYINT DEFAULT 1 NOT NULL,
  isOwned TINYINT DEFAULT 1 NOT NULL,
  sharedFromMerchantId INT,
  commissionRate DECIMAL(5,2),
  createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL,
  INDEX msp_merchantId_idx (merchantId),
  INDEX msp_productId_idx (productId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  // 6. merchant_product_share_requests
  {
    name: 'merchant_product_share_requests',
    sql: `CREATE TABLE merchant_product_share_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requesterMerchantId INT NOT NULL,
  ownerMerchantId INT NOT NULL,
  productId INT,
  proposedCommissionRate DECIMAL(5,2),
  agreedCommissionRate DECIMAL(5,2),
  status ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending' NOT NULL,
  message TEXT,
  replyMessage TEXT,
  createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL,
  INDEX mps_requester_idx (requesterMerchantId),
  INDEX mps_owner_idx (ownerMerchantId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  // 7. wine_regions
  {
    name: 'wine_regions',
    sql: `CREATE TABLE wine_regions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchantId INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  country VARCHAR(50),
  description TEXT,
  imageUrl TEXT,
  sortOrder INT DEFAULT 0 NOT NULL,
  isActive TINYINT DEFAULT 1 NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
  INDEX wr_merchantId_idx (merchantId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  // 8. product_import_requests
  {
    name: 'product_import_requests',
    sql: `CREATE TABLE product_import_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productId INT NOT NULL,
  merchantCode VARCHAR(50) NOT NULL,
  requestedByUserId INT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending' NOT NULL,
  note TEXT,
  createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL,
  INDEX pir_merchantCode_idx (merchantCode),
  INDEX pir_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
];

for (const t of createStatements) {
  await conn.execute(t.sql);
  console.log(`✅ 建表成功: ${t.name}`);
}

// 查询cx8618用户ID
const [userRows] = await conn.execute(`SELECT id FROM users WHERE username = 'cx8618' LIMIT 1`);
const cx8618UserId = userRows.length > 0 ? userRows[0].id : 9999;
console.log(`\n✅ cx8618 userId = ${cx8618UserId}`);

// 插入商家记录
const [merchantResult] = await conn.execute(
  `INSERT INTO merchants (userId, merchantCode, shopName, shopDescription, themeColor, shopType, status, share_description)
   VALUES (?, 'cx8618', '红酒文化商会', '汇聚全球顶级酒庄资源，传播红酒文化，连接爱酒之人', '#8B1A1A', 'wine', 'active', '汇聚全球顶级酒庄资源，传播红酒文化，连接爱酒之人')`,
  [cx8618UserId]
);
const merchantId = merchantResult.insertId;
console.log(`✅ 商家cx8618插入成功 (ID: ${merchantId})`);

// 插入三款产品
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
    }),
    extendedFields: JSON.stringify({ country: '西班牙', vintage: '2020', region: '托罗', alcohol: '14.5%vol', volume: '750ml', grade: 'DO', grape: '100%丹魄', rpScore: '92', stScore: '91', penaScore: '92' }),
  },
];

console.log('\n插入三款红酒产品...');
for (const p of products) {
  const [result] = await conn.execute(
    `INSERT INTO merchant_products (ownerMerchantId, name, subtitle, description, basePrice, originalPrice, stock, status, sourceType, isShareable, extendedFields, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, 999, 'active', 'merchant', 1, ?, 0)`,
    [merchantId, p.name, p.subtitle, p.description, p.basePrice, p.originalPrice, p.extendedFields]
  );
  const productId = result.insertId;
  console.log(`✅ 商品写入总库: ${p.name} (ID: ${productId})`);
  
  // 写入店铺陈列层
  await conn.execute(
    `INSERT INTO merchant_shop_products (merchantId, productId, isOwned, isVisible, customSortOrder) VALUES (?, ?, 1, 1, 0)`,
    [merchantId, productId]
  );
  console.log(`✅ 商品写入店铺陈列层`);
}

// 最终验证
console.log('\n--- 最终验证 ---');
for (const t of ['merchants','merchant_products','merchant_shop_products']) {
  const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
  console.log(`${t}: ${rows[0].cnt} 条`);
}

// 验证商家status字段
const [m] = await conn.execute(`SELECT id, merchantCode, shopName, status FROM merchants`);
console.log('商家详情:', JSON.stringify(m));

await conn.end();
console.log('\n🎉 完成！所有表结构已与Schema对齐，数据已写入腾讯云MySQL。');
