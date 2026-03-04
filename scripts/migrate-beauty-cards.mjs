import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// 读取 .env 文件
const envContent = readFileSync('/home/ubuntu/haoyouji-web/.env', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

const dbUrl = envVars['ORIGINAL_DATABASE_URL'] || envVars['DATABASE_URL'];
if (!dbUrl) {
  console.error('No database URL found');
  process.exit(1);
}

// 解析 URL
const url = new URL(dbUrl);
const isLocalhost = url.hostname.includes('localhost') || url.hostname.includes('127.0.0.1');
const config = {
  uri: dbUrl,
  connectTimeout: 30000,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
  charset: 'utf8mb4',
};

console.log('Connecting to:', config.host, config.port, config.database);

const conn = await mysql.createConnection(config);

// 建消费卡表
await conn.execute(`
  CREATE TABLE IF NOT EXISTS beauty_member_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    operatorId INT NOT NULL,
    cardType VARCHAR(20) NOT NULL,
    startDate VARCHAR(20) NOT NULL,
    endDate VARCHAR(20) NOT NULL,
    isActive INT NOT NULL DEFAULT 1,
    remark VARCHAR(200),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    INDEX idx_userId (userId),
    INDEX idx_operatorId (operatorId)
  )
`);
console.log('beauty_member_cards table created/exists');

// 建消费记录表
await conn.execute(`
  CREATE TABLE IF NOT EXISTS beauty_visit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    operatorId INT NOT NULL,
    remark VARCHAR(200),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    INDEX idx_userId (userId),
    INDEX idx_operatorId (operatorId)
  )
`);
console.log('beauty_visit_logs table created/exists');

await conn.end();
console.log('Migration complete!');
