import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;
if (!url) { console.error('No DATABASE_URL env var'); process.exit(1); }

const conn = await mysql.createConnection(url);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS aj_companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ledger_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    tax_no VARCHAR(50),
    address VARCHAR(200),
    phone VARCHAR(50),
    bank_name VARCHAR(100),
    bank_account VARCHAR(100),
    remark VARCHAR(300),
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    INDEX aj_companies_ledger_idx (ledger_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
console.log('aj_companies OK');

await conn.execute(`
  CREATE TABLE IF NOT EXISTS aj_company_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ledger_id INT NOT NULL,
    company_id INT NOT NULL,
    user_id INT NOT NULL,
    is_enabled TINYINT DEFAULT 0 NOT NULL,
    enabled_by INT,
    enabled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    UNIQUE INDEX aj_company_access_uniq (company_id, user_id),
    INDEX aj_company_access_ledger_idx (ledger_id),
    INDEX aj_company_access_user_idx (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
console.log('aj_company_access OK');

await conn.end();
console.log('Done!');
