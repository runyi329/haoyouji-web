import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env
const envPath = resolve(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  }
} catch {}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);

await conn.execute(`CREATE TABLE IF NOT EXISTS platform_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  subtitle VARCHAR(300),
  category VARCHAR(50) NOT NULL DEFAULT 'wine',
  basePrice DECIMAL(10,2) NOT NULL,
  mainImageUrl TEXT,
  description TEXT,
  extendedFields TEXT,
  tags TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  createdBy INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX pp_category_idx (category),
  INDEX pp_status_idx (status)
)`);
console.log('✓ platform_products table created');

await conn.execute(`CREATE TABLE IF NOT EXISTS product_import_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platformProductId INT NOT NULL,
  merchantId INT NOT NULL,
  merchantCode VARCHAR(50) NOT NULL,
  requestType VARCHAR(20) NOT NULL DEFAULT 'merchant_apply',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  message TEXT,
  replyMessage TEXT,
  reviewedBy INT,
  reviewedAt TIMESTAMP NULL,
  merchantProductId INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX pir_platformProductId_idx (platformProductId),
  INDEX pir_merchantId_idx (merchantId),
  INDEX pir_status_idx (status),
  INDEX pir_merchantCode_idx (merchantCode)
)`);
console.log('✓ product_import_requests table created');

await conn.end();
console.log('Done!');
