import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(url);

const sql = `
CREATE TABLE IF NOT EXISTS \`points_redeem_orders\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`orderNo\` varchar(30) NOT NULL,
  \`userId\` int NOT NULL,
  \`productId\` int NOT NULL,
  \`productName\` varchar(200) NOT NULL,
  \`productImage\` text,
  \`pointsSpent\` int NOT NULL,
  \`quantity\` int NOT NULL DEFAULT 1,
  \`status\` varchar(20) NOT NULL DEFAULT 'pending',
  \`recipientName\` varchar(100) NOT NULL,
  \`recipientPhone\` varchar(20) NOT NULL,
  \`province\` varchar(50),
  \`city\` varchar(50),
  \`district\` varchar(50),
  \`detailedAddress\` text NOT NULL,
  \`trackingCompany\` varchar(50),
  \`trackingNo\` varchar(100),
  \`shippedAt\` timestamp NULL,
  \`remark\` text,
  \`cancelReason\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`orderNo\` (\`orderNo\`),
  KEY \`pro_userId_idx\` (\`userId\`),
  KEY \`pro_productId_idx\` (\`productId\`),
  KEY \`pro_status_idx\` (\`status\`),
  KEY \`pro_createdAt_idx\` (\`createdAt\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

try {
  await conn.execute(sql);
  console.log("✅ points_redeem_orders table created successfully");
  
  // Verify
  const [rows] = await conn.execute("SHOW TABLES LIKE 'points_redeem_orders'");
  console.log("Table exists:", rows.length > 0 ? "YES ✅" : "NO ❌");
} catch (err) {
  console.error("❌ Error:", err.message);
} finally {
  await conn.end();
}
